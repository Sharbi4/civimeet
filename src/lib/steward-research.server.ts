import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { researchInputSchema, type ResearchInput, type ResearchResult } from "./research";
import { researchCommunity, ResearchError } from "./perplexity.server";

const inputSchema = researchInputSchema.extend({
  organizationId: z.string().uuid(),
  requestId: z.string().uuid(),
  planId: z.string().uuid().nullable().default(null),
  includeKnowledge: z.boolean().default(false),
});
type Submission = z.infer<typeof inputSchema>;
type Run = {
  id: string;
  status: "running" | "completed" | "failed";
  result: ResearchResult | null;
  error: string | null;
};
type Dependencies = {
  configured: () => boolean;
  authorize: (token: string, organizationId: string) => Promise<string>;
  reserve: (actor: string, input: Submission) => Promise<{ started: boolean; run: Run }>;
  context: (input: Submission) => Promise<string>;
  research: (input: ResearchInput, context: string) => Promise<ResearchResult>;
  finish: (id: string, result: ResearchResult | null, error: string | null) => Promise<void>;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
export function stewardResearchStatus() {
  return json({ configured: configured(), provider: "perplexity", dailyRequestLimit: 10 });
}
function configured() {
  return ["PERPLEXITY_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].every((key) =>
    Boolean(process.env[key]?.trim()),
  );
}
function database() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers, signal: AbortSignal.timeout(15_000) });
      },
    },
  });
}
const defaults: Dependencies = {
  configured,
  async authorize(token, organizationId) {
    const db = database();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ResearchError(401, "Sign in again before running research.");
    const membership = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (
      membership.error ||
      !membership.data ||
      !["owner", "admin", "organizer"].includes(membership.data.role)
    )
      throw new ResearchError(403, "Organization editor access is required.");
    return data.user.id;
  },
  async reserve(actor, input) {
    const { data, error } = await database().rpc("reserve_steward_research", {
      actor,
      workspace: input.organizationId,
      request_key: input.requestId,
      target_plan: input.planId,
      research_input: {
        question: input.question,
        location: input.location,
        purpose: input.purpose,
        includeKnowledge: input.includeKnowledge,
      },
    });
    if (error) {
      if (
        error.message.includes("Research already running") ||
        error.message.includes("research limit reached")
      )
        throw new ResearchError(429, error.message);
      throw new ResearchError(
        400,
        "Could not start research. Check organization access and the selected plan.",
      );
    }
    return data;
  },
  async context(input) {
    const db = database();
    const parts: string[] = [];
    if (input.planId) {
      const { data, error } = await db
        .from("steward_plans")
        .select("title,contribution,connection,gathering,follow_up")
        .eq("organization_id", input.organizationId)
        .eq("id", input.planId)
        .single();
      if (error) throw new Error("Plan context could not be loaded");
      parts.push(JSON.stringify(data).slice(0, 3500));
    }
    if (input.includeKnowledge) {
      const { data, error } = await db
        .from("organization_knowledge")
        .select("title,content")
        .eq("organization_id", input.organizationId)
        .order("updated_at", { ascending: false })
        .limit(3);
      if (error) throw new Error("Shared knowledge could not be loaded");
      parts.push(
        JSON.stringify(
          (data ?? []).map((row) => ({ title: row.title, content: row.content.slice(0, 600) })),
        ),
      );
    }
    return parts.join("\n");
  },
  research: (input, context) => researchCommunity(input, { context }),
  async finish(id, result, error) {
    const response = await database().rpc("finish_steward_research", {
      target_run: id,
      research_result: result,
      failure: error,
    });
    if (response.error) throw new Error("Research could not be saved");
  },
};

export async function handleStewardResearch(
  request: Request,
  overrides: Partial<Dependencies> = {},
) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site requests are not allowed." }, 403);
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 8192)
    return json({ error: "Sign in before running research." }, 401);
  if (!deps.configured())
    return json(
      {
        error:
          "Research setup is incomplete. Configure the server's Perplexity and database credentials.",
      },
      503,
    );
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "Send JSON." }, 415);
  let runId: string | null = null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Provide a research question." }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16384) {
          await reader.cancel();
          return json({ error: "Research request is too large." }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const parsed = inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success)
      return json({ error: "Check the question, location, organization, and plan." }, 400);
    const input = parsed.data;
    const actor = await deps.authorize(authorization.slice(7), input.organizationId);
    const reservation = await deps.reserve(actor, input);
    if (!reservation.started)
      return json(
        { run: reservation.run, replayed: true },
        reservation.run.status === "running" ? 202 : 200,
      );
    runId = reservation.run.id;
    const context = await deps.context(input);
    const result = await deps.research(
      { question: input.question, location: input.location, purpose: input.purpose },
      context,
    );
    await deps.finish(runId, result, null);
    return json({ run: { id: runId, status: "completed", result, error: null } });
  } catch (error) {
    const message =
      error instanceof ResearchError
        ? error.message
        : error instanceof SyntaxError
          ? "Invalid JSON request."
          : "Research could not finish or save its result. Refresh history before retrying.";
    if (runId) {
      try {
        await deps.finish(runId, null, message);
      } catch {
        /* Durable stale-run recovery handles interrupted persistence. */
      }
    }
    return json(
      { error: message, runId },
      error instanceof ResearchError ? error.status : error instanceof SyntaxError ? 400 : 502,
    );
  }
}
