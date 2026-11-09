import "@tanstack/react-start/server-only";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { handleStewardResearch } from "../steward-research.server";
import { organizerInstructions, organizerTools } from "./organizer-personality";
import { paymentRequestSchema } from "../agent-payments";

const inputSchema = z
  .object({
    organizationId: z.string().uuid(),
    thread: z.enum(["main", "venue", "outreach", "volunteers"]),
    action: z.enum(["status", "send", "resume", "cancel", "new"]),
    message: z.string().trim().min(1).max(6000).optional(),
    requestId: z.string().uuid().optional(),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;
type SessionRow = {
  id: string;
  organization_id: string;
  provider_id: string | null;
  lease_id: string;
  lease_until: string | null;
};
export class OrganizerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const transientStatuses = new Set([408, 409, 429, 500, 502, 503, 504]);
/** OpenAI hiccups (busy, overloaded, dropped connection) that are worth one more try. */
export function isTransientProviderError(e: unknown) {
  if (e instanceof OpenAI.APIConnectionTimeoutError) return false;
  if (e instanceof OpenAI.APIConnectionError) return true;
  return e instanceof OpenAI.APIError && typeof e.status === "number" && transientStatuses.has(e.status);
}
/**
 * Retries a provider call that is safe to repeat (reads, opening the event stream, and
 * submissions carrying an idempotency key). Never wrap calls that could double-act.
 */
export async function retryTransient<T>(
  call: () => Promise<T>,
  delays: readonly number[] = [400, 1200],
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      if (attempt >= delays.length || signal?.aborted || !isTransientProviderError(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
/** The configured organizer model, or the default when the setting isn't a model name. */
export function organizerModel(env: Record<string, string | undefined> = process.env) {
  const configured = env["OPENAI_ORGANIZER_MODEL"]?.trim() ?? "";
  return /^[a-z0-9][a-z0-9._:\-/]{1,63}$/i.test(configured) ? configured : "gpt-6-sol";
}
export function organizerConfiguration() {
  // A configured key enables the requested rollout; an explicit false remains a kill switch.
  const enabled = process.env["OPENAI_ORGANIZER_ENABLED"]?.trim().toLowerCase() !== "false";
  const ready = enabled && Boolean(process.env["OPENAI_API_KEY"]?.trim());
  return { ready, enabled, provider: "openai", browserEnabled: false, dailyMessageLimit: 30 };
}
function database() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"],
    url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new OrganizerError(503, "Workspace database is not configured.");
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
function provider() {
  if (!organizerConfiguration().ready)
    throw new OrganizerError(
      503,
      "The OpenAI organizer needs server configuration. Research is still available below.",
    );
  return new OpenAI({ apiKey: process.env["OPENAI_API_KEY"], maxRetries: 0, timeout: 30000 }).beta
    .agents.sessions;
}
const defaults = {
  configuration: organizerConfiguration,
  provider,
  async authorize(token: string, org: string) {
    const db = database(),
      u = await db.auth.getUser(token);
    if (u.error || !u.data.user) throw new OrganizerError(401, "Sign in to use your organizer.");
    const m = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", org)
      .eq("user_id", u.data.user.id)
      .maybeSingle();
    if (m.error || !["owner", "admin", "organizer"].includes(m.data?.role))
      throw new OrganizerError(403, "Organization editor access is required.");
    return u.data.user.id;
  },
  async current(input: Input): Promise<SessionRow | null> {
    const r = await database()
      .from("organizer_sessions")
      .select("id,organization_id,provider_id,lease_id,lease_until")
      .eq("organization_id", input.organizationId)
      .eq("thread", input.thread)
      .eq("archived", false)
      .maybeSingle();
    if (r.error) throw new OrganizerError(503, "Organizer storage is not available yet.");
    return r.data;
  },
  async reserve(actor: string, input: Input): Promise<{ session: SessionRow; replayed: boolean }> {
    const r = await database().rpc("reserve_organizer_turn", {
      actor,
      workspace: input.organizationId,
      chat_thread: input.thread,
      submission: input.requestId ?? crypto.randomUUID(),
      message_text: input.message ?? "Resume saved work",
      resuming: input.action === "resume",
    });
    if (r.error)
      throw new OrganizerError(
        409,
        "The organizer is busy or the daily message limit has been reached. Refresh saved work before retrying.",
      );
    return r.data;
  },
  async update(row: SessionRow, values: Record<string, unknown>) {
    const r = await database()
      .from("organizer_sessions")
      .update(values)
      .eq("organization_id", row.organization_id)
      .eq("id", row.id)
      .eq("lease_id", row.lease_id)
      .select("id");
    if (r.error || !r.data?.length)
      throw new OrganizerError(409, "Conversation checkpoint changed. Refresh saved work.");
  },
  async archive(row: SessionRow) {
    const r = await database()
      .from("organizer_sessions")
      .update({ archived: true })
      .eq("id", row.id)
      .eq("organization_id", row.organization_id)
      .or(`lease_until.is.null,lease_until.lte.${new Date().toISOString()}`)
      .select("id");
    if (r.error || !r.data?.length)
      throw new OrganizerError(
        409,
        "Wait for the current response to finish before starting a new conversation.",
      );
  },
  async context(org: string) {
    const db = database();
    const queries = await Promise.all([
      db.from("organizations").select("name").eq("id", org).single(),
      db
        .from("organization_briefs")
        .select("area,mission,voice,event_goal,platform_actions")
        .eq("organization_id", org)
        .maybeSingle(),
      db
        .from("organization_knowledge")
        .select("title,content,source_url")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(12),
      db
        .from("vendors")
        .select("name,category,service_areas,status,notes")
        .eq("organization_id", org)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(25),
      db
        .from("community_events")
        .select("id,title,purpose,geographic_area,status")
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("steward_research_runs")
        .select("input,result,created_at")
        .eq("organization_id", org)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (queries.some((r) => r.error))
      throw new OrganizerError(503, "Saved organization context could not be loaded.");
    return JSON.stringify(
      Object.fromEntries(
        ["organization", "brief", "knowledge", "vendors", "events", "research"].map((key, i) => [
          key,
          queries[i]?.data,
        ]),
      ),
    ).slice(0, 40000);
  },
  async researchAgent(org: string) {
    const r = await database()
      .from("platform_agents")
      .select("id")
      .eq("organization_id", org)
      .eq("platform", "web")
      .eq("selected", true)
      .eq("paused", false)
      .maybeSingle();
    if (r.error || !r.data)
      throw new OrganizerError(
        409,
        "Select and unpause the public web agent in Connections before collecting vendors.",
      );
    return r.data.id as string;
  },
  research: handleStewardResearch,
  /** Every helper agent's connection, what waits for people, and this month's spending. */
  async helpers(org: string) {
    const db = database();
    const month = new Date().toISOString().slice(0, 7) + "-01";
    const queries = await Promise.all([
      db
        .from("organization_connectors")
        .select("connector,status,account_label,detail,last_checked_at")
        .eq("organization_id", org),
      db
        .from("organizer_approvals")
        .select("title,destination,kind")
        .eq("organization_id", org)
        .eq("status", "pending")
        .limit(10),
      db
        .from("agent_payments")
        .select("agent,payee,purpose,amount_cents,status,approval,over_budget")
        .eq("organization_id", org)
        .eq("budget_month", month)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("organization_payment_settings")
        .select("monthly_budget_cents,auto_approve_limit_cents,provider")
        .eq("organization_id", org)
        .maybeSingle(),
    ]);
    if (queries.some((r) => r.error))
      throw new OrganizerError(503, "Helper status could not be loaded.");
    return JSON.stringify({
      helpers: queries[0].data,
      waitingForApproval: queries[1].data,
      paymentsThisMonth: queries[2].data,
      paymentSettings: queries[3].data,
      note: "Approved payments are not paid until a payment account (Stripe or Plaid) is connected and the payment service confirms it.",
    }).slice(0, 30000);
  },
  /** Ask to pay, as the signed-in person, so the database applies their role and the budget rule. */
  async requestPayment(token: string, org: string, input: z.infer<typeof paymentRequestSchema>) {
    const url = process.env["SUPABASE_URL"],
      key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new OrganizerError(503, "Workspace database is not configured.");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
    });
    const r = await client.rpc("request_agent_payment", {
      workspace: org,
      helper: input.helper ?? "main",
      payee_name: input.payee,
      payment_purpose: input.purpose,
      payment_category: input.category,
      cents: Math.round(input.amount_usd * 100),
    });
    if (r.error)
      return JSON.stringify({
        status: "failed",
        message: "The payment request could not be saved. Nothing was paid.",
      });
    const row = r.data as { status: string; approval: string; over_budget: boolean };
    return JSON.stringify({
      status: row.status,
      approval: row.approval,
      overBudget: row.over_budget,
      message:
        row.status === "approved"
          ? "Approved automatically under the team's limit. Not paid yet: money moves only once the payment account is connected and confirms it."
          : "Waiting for an administrator to approve in Settings → Payments. Nothing was paid.",
    });
  },
};
export type OrganizerDependencies = typeof defaults;
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export function toolRequestId(callId: string) {
  const h = createHash("sha256").update(callId).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export async function executeOrganizerTool(
  name: string,
  args: unknown,
  scope: { org: string; actor: string; token: string; url: string; callId: string },
  deps: OrganizerDependencies,
) {
  await deps.authorize(scope.token, scope.org); // Revocation takes effect before each tool.
  if (name === "organization_context") return deps.context(scope.org);
  if (name === "helpers_report") return deps.helpers(scope.org);
  if (name === "request_payment") {
    const input = paymentRequestSchema.parse(args);
    return deps.requestPayment(scope.token, scope.org, input);
  }
  if (name !== "research_local") throw new OrganizerError(400, "This tool is not available.");
  const input = z
    .object({ question: z.string().min(5).max(3000), location: z.string().min(2).max(200) })
    .strict()
    .parse(args);
  const agentId = await deps.researchAgent(scope.org);
  const response = await deps.research(
    new Request(new URL("/api/research", scope.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${scope.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        agentId,
        organizationId: scope.org,
        requestId: toolRequestId(scope.callId),
        purpose: "vendors",
        includeKnowledge: true,
        collectVendors: true,
        skillId: "local_partner_discovery",
        threadKey: "main",
      }),
    }),
  );
  if (response.status === 202)
    return JSON.stringify({
      status: "running",
      message:
        "Research is still running. Its saved record will be available later; do not report completion.",
    });
  if (!response.ok)
    return JSON.stringify({
      status: "failed",
      message:
        "Research could not complete. Check the research history and configuration; no external actions were taken.",
    });
  return JSON.stringify(await response.json()).slice(0, 45000);
}
async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new OrganizerError(400, "Missing request.");
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  try {
    for (;;) {
      const p = await reader.read();
      if (p.done) break;
      size += p.value.byteLength;
      if (size > 32000) {
        await reader.cancel();
        throw new OrganizerError(413, "Message too large.");
      }
      text += decoder.decode(p.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return inputSchema.parse(JSON.parse(text + decoder.decode()));
}
export async function handleManagedOrganizer(
  request: Request,
  overrides: Partial<OrganizerDependencies> = {},
) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site request denied." }, 403);
  const token = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!token) return json({ error: "Sign in to use your organizer." }, 401);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "Send JSON." }, 415);
  let reserved: SessionRow | null = null;
  try {
    const input = await readInput(request),
      actor = await deps.authorize(token, input.organizationId);
    const configuration = deps.configuration();
    if (!configuration.ready)
      return input.action === "status"
        ? json({ configuration, messages: [], status: "configuration_required" })
        : json(
            {
              error:
                "Add OPENAI_API_KEY, OPENAI_ORGANIZER_MODEL and OPENAI_ORGANIZER_ENABLED=true to server secrets. Existing research remains available.",
            },
            503,
          );
    const api = deps.provider();
    if (input.action === "status" || input.action === "cancel" || input.action === "new") {
      const row = await deps.current(input);
      if (!row?.provider_id) {
        if (row && input.action === "new") {
          await deps.archive(row);
          return json({ status: "ready" });
        }
        return json({ configuration, status: row ? "interrupted" : "ready", messages: [] });
      }
      const session = await api.retrieve(row.provider_id);
      if (input.action === "cancel") {
        await api.events.create(row.provider_id, {
          events: [{ type: "agent.session.input.cancel" }],
        });
        return json({ status: "cancellation_requested" });
      }
      if (input.action === "new") {
        if (session.status !== "idle" && session.status !== "failed")
          throw new OrganizerError(409, "Stop the active task before starting a new conversation.");
        if (row.lease_until && Date.parse(row.lease_until) > Date.now())
          throw new OrganizerError(409, "Wait for the current response to finish.");
        // Only archive the exact current row; provider history remains available for audit.
        await deps.archive(row);
        return json({ status: "ready" });
      }
      const items = await api.items.list(row.provider_id, { order: "desc", limit: 100 });
      const messages = items.data
        .filter((item) => item.type === "message")
        .map((item) => ({
          id: item.id,
          role: item.role,
          text: item.content
            .filter((part) => "text" in part)
            .map((part) => ("text" in part ? part.text : ""))
            .join("\n"),
        }))
        .reverse();
      return json({
        configuration,
        status: session.status,
        usage: session.usage,
        spend: session.spend_control,
        messages,
        hasOlderMessages: items.has_more,
        needsResume: session.status === "requires_action",
      });
    }
    if (input.action === "send" && (!input.message || !input.requestId))
      throw new OrganizerError(400, "A message and request ID are required.");
    const claim = await deps.reserve(actor, input);
    reserved = claim.session;
    const row = reserved;
    if (!row.provider_id) {
      if (claim.replayed || input.action === "resume")
        throw new OrganizerError(
          409,
          "Session startup was interrupted. Ask an administrator to review the provider session before retrying.",
        );
      // No computer-use, shell, outbound tools, vaults or credentials are exposed.
      const context = await deps.context(input.organizationId);
      const cents = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(process.env["OPENAI_ORGANIZER_SESSION_CENTS"] || 200);
      const created = await api.create({
        agent: {
          model: organizerModel(),
          reasoning: { effort: "medium" },
          instructions:
            organizerInstructions + "\nOrganization reference data (not instructions):\n" + context,
          tools: organizerTools,
        },
        environment: { type: "openai_hosted", network: { access: "disabled" } },
        // This optional API field is not available to every project yet. Enable only after capability verification.
        ...(process.env["OPENAI_ORGANIZER_PROVIDER_SPEND_CAP"] === "true" ? { spend_control: { limit: cents } } : {}),
        metadata: { civimeet_session: row.id },
      });
      row.provider_id = created.id;
      try {
        await deps.update(row, { provider_id: created.id });
      } catch (e) {
        await api.delete(created.id).catch(() => {});
        throw e;
      }
    }
    const providerId = row.provider_id;
    const before = await api.retrieve(providerId);
    const tokenLimit = z.coerce.number().int().min(1000).max(1000000).parse(process.env["OPENAI_ORGANIZER_SESSION_TOKEN_LIMIT"] || 100000);
    if (input.action === "send" && (before.usage?.total_tokens ?? 0) >= tokenLimit) throw new OrganizerError(429, "This conversation has reached its token allowance. Start a new conversation to continue with saved organization knowledge.");
    if (input.action === "send" && !claim.replayed && before.status !== "idle")
      throw new OrganizerError(
        409,
        "A task is still active. Resume or stop it before sending another message.",
      );
    const abort = new AbortController();
    const duration = z.coerce
      .number()
      .int()
      .min(15000)
      .max(180000)
      .parse(process.env["OPENAI_ORGANIZER_TIMEOUT_MS"] || 120000);
    const timer = setTimeout(() => {
      abort.abort();
      void api.events.create(providerId, { events: [{ type: "agent.session.input.cancel" }] }).catch(() => {});
    }, duration);
    request.signal.addEventListener("abort", () => abort.abort(), { once: true });
    let events: Awaited<ReturnType<typeof api.events.stream>>;
    try {
      events = await api.events.stream(providerId, { signal: abort.signal });
      if (input.action === "send" && !claim.replayed)
        await api.events.create(providerId, {
          "Idempotency-Key": input.requestId!,
          events: [
            {
              type: "agent.session.input.message",
              input: [{ role: "user", content: [{ type: "input_text", text: input.message! }] }],
            },
          ],
        });
    } catch (e) {
      clearTimeout(timer);
      abort.abort();
      throw e;
    }
    const scope = { org: input.organizationId, actor, token, url: request.url };
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        const handled = new Set<string>();
        let toolCount = 0;
        const tools = async (session: Awaited<ReturnType<typeof api.retrieve>>) => {
          for (const action of session.required_actions) {
            if (action.type !== "function_call") {
              send({
                type: "blocked",
                message:
                  "This task needs an integration that is not enabled. Stop it and use the existing browser workspace.",
              });
              return false;
            }
            if (handled.has(action.call_id)) continue;
            if (++toolCount > 4)
              throw new OrganizerError(429, "Tool limit reached. Resume saved work to continue.");
            handled.add(action.call_id);
            send({
              type: "activity",
              message:
                action.name === "research_local"
                  ? "Researching local options and saving sourced findings…"
                  : "Reading your organization's saved context…",
            });
            let result: { success: true; output: string } | { success: false; error: string };
            try {
              result = {
                success: true,
                output: await executeOrganizerTool(
                  action.name,
                  action.arguments,
                  { ...scope, callId: providerId + action.call_id },
                  deps,
                ),
              };
            } catch {
              result = {
                success: false,
                error: "The organization tool could not complete. Do not claim it succeeded.",
              };
            }
            if (abort.signal.aborted) return false;
            await api.events.create(providerId, {
              events: [
                {
                  type: "agent.session.input.tool_result",
                  turn_id: action.turn_id,
                  call_id: action.call_id,
                  ...result,
                },
              ],
            });
          }
          return true;
        };
        try {
          send({ type: "started" });
          if ((input.action === "resume" || claim.replayed) && before.status === "idle") {
            send({ type: "saved", message: "Saved conversation recovered." });
            return;
          }
          if (before.status === "requires_action" && !(await tools(before))) return;
          for await (const event of events) {
            if (event.type === "agent.session.turn.output_text.delta")
              send({
                type: "delta",
                id: `${event.item_id}:${event.content_index}`,
                text: event.delta,
              });
            else if (event.type === "agent.session.turn.output_text.done")
              send({
                type: "text",
                id: `${event.item_id}:${event.content_index}`,
                text: event.text,
              });
            else if (event.type === "agent.session.requires_action") {
              if (!(await tools(await api.retrieve(providerId)))) break;
            } else if (
              [
                "agent.session.turn.completed",
                "agent.session.turn.cancelled",
                "agent.session.turn.failed",
              ].includes(event.type) &&
              "turn" in event &&
              event.turn.subagent_id === null
            ) {
              send({ type: "outcome", status: event.type.split(".").pop() });
              break;
            } else if (
              event.type === "error" ||
              event.type === "agent.session.failed" ||
              event.type === "agent.session.environment.failed"
            )
              throw new Error("Provider task failed");
          }
        } catch {
          send({
            type: "interrupted",
            message: "The live connection ended. Refresh saved work, then resume or stop the task.",
          });
        } finally {
          clearTimeout(timer);
          abort.abort();
          events.controller.abort();
          await deps.update(row, { lease_id: null, lease_until: null }).catch(() => {});
          controller.close();
        }
      },
      cancel() {
        abort.abort();
      },
    });
    reserved = null; // Stream owns lease cleanup.
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    if (reserved)
      await deps.update(reserved, { lease_id: null, lease_until: null }).catch(() => {});
    if (e instanceof OrganizerError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return json({ error: "Check the message and organization." }, 400);
    if (e instanceof OpenAI.APIError) {
      const code = typeof e.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(e.code) ? e.code : null;
      const param =
        typeof e.param === "string" && /^[a-z0-9_.\[\]-]{1,120}$/i.test(e.param) ? e.param : null;
      return json(
        {
          error: `OpenAI returned HTTP ${e.status ?? 502}${code ? ` (${code})` : ""}${param ? ` for ${param}` : ""}. Check Agents API access, billing and the configured model.`,
          providerStatus: e.status,
          providerCode: code,
          providerParam: param,
        },
        502,
      );
    }
    return json(
      {
        error:
          "OpenAI could not start or recover this conversation. Check the server key, model and Agents permissions; refresh before retrying.",
      },
      502,
    );
  }
}
