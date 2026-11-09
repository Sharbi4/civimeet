import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { handleStewardResearch } from "./steward-research.server";

const schema = z.object({ organizationId: z.string().uuid(), taskId: z.string().uuid() }).strict();
type Task = {
  status: string;
  id: string;
  agent_id: string;
  event_id: string | null;
  skill_id: "auto" | "community_presence" | "local_partner_discovery";
  research_request_id: string;
  objective: string;
  lease_id: string;
  result: string;
};
class WorkError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function database() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new WorkError(503, "Agent work is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers, signal: AbortSignal.timeout(15000) });
      },
    },
  });
}
const defaults = {
  async authorize(token: string, org: string) {
    const db = database();
    const user = await db.auth.getUser(token);
    if (user.error || !user.data.user) throw new WorkError(401, "Sign in to run agent work.");
    const membership = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", org)
      .eq("user_id", user.data.user.id)
      .maybeSingle();
    if (membership.error || !["owner", "admin", "organizer"].includes(membership.data?.role))
      throw new WorkError(403, "Organization editor access is required.");
    return user.data.user.id;
  },
  async claim(
    actor: string,
    organizationId: string,
    taskId: string,
  ): Promise<{ replayed: boolean; task: Task }> {
    const result = await database().rpc("claim_editor_agent_work", {
      actor,
      workspace: organizationId,
      target_task: taskId,
    });
    if (result.error)
      throw new WorkError(
        409,
        "Task unavailable. Check its due time, preceding work, agent pause state, and whether another task is running.",
      );
    return result.data;
  },
  research: handleStewardResearch,
  async finish(actor: string, org: string, task: Task, succeeded: boolean, outcome: string) {
    const result = await database().rpc("finish_editor_agent_work", {
      actor,
      workspace: org,
      target_task: task.id,
      task_lease: task.lease_id,
      succeeded,
      outcome,
    });
    if (result.error)
      throw new WorkError(
        409,
        "Research may have finished, but the task checkpoint could not be saved. Refresh before continuing.",
      );
  },
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function handleAgentWork(request: Request, overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site requests are not allowed." }, 403);
  const token = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!token) return json({ error: "Sign in to run agent work." }, 401);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "Send JSON." }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing task." }, 400);
    let text = "";
    let size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2048) {
          await reader.cancel();
          return json({ error: "Request too large." }, 413);
        }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const input = schema.safeParse(JSON.parse(text));
    if (!input.success) return json({ error: "Choose an organization and saved task." }, 400);
    const actor = await deps.authorize(token, input.data.organizationId);
    const claim = await deps.claim(actor, input.data.organizationId, input.data.taskId);
    if (claim.replayed)
      return json(
        { status: claim.task.status, replayed: true, result: claim.task.result },
        claim.task.status === "completed" ? 200 : 409,
      );
    const task = claim.task;
    // Fixed internal research tool only. Neither model output nor a queued objective can choose a URL or an outbound action.
    const response = await deps.research(
      new Request(new URL("/api/research", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          organizationId: input.data.organizationId,
          requestId: task.research_request_id,
          agentId: task.agent_id,
          eventId: task.event_id ?? undefined,
          skillId: task.skill_id,
          question: task.objective.slice(0, 3000),
          purpose: "resources",
          includeKnowledge: true,
          threadKey: "main",
        }),
      }),
    );
    const body = await response.json();
    if (response.status === 202)
      return json(
        {
          status: "running",
          message: "Research is still running. Refresh its saved status before retrying.",
        },
        202,
      );
    const succeeded = response.ok && body.run?.status === "completed";
    const outcome = succeeded
      ? `Research completed; no external actions taken. Research record: ${body.run.id}\n${body.run.result?.answer ?? ""}`.slice(
          0,
          12000,
        )
      : String(
          body.error ?? body.run?.error ?? "Research did not complete. Review its saved history.",
        ).slice(0, 2000);
    await deps.finish(actor, input.data.organizationId, task, succeeded, outcome);
    return json(
      { status: succeeded ? "completed" : "failed", result: outcome },
      succeeded ? 200 : 409,
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof WorkError
            ? error.message
            : "Agent work was interrupted. Refresh saved task status before retrying.",
      },
      error instanceof WorkError ? error.status : 500,
    );
  }
}
