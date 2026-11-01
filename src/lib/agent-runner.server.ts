import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { eventDraftSchema, missingEventDetails, platformRoles } from "./civi";
import { getConnector } from "./connectors";
import { researchCommunity, ResearchError } from "./perplexity.server";
import type { ResearchInput, ResearchResult } from "./research";

// The task runner: claims the next runnable step of a plan (dependencies done, lease held),
// carries it out with a real tool, and records a verified outcome. It never reports work as
// done unless the tool result proves it: a draft is "ready for review", not "published";
// a researched venue is a candidate, not a booking.
export type AgentTask = {
  id: string;
  organization_id: string;
  plan_id: string;
  position: number;
  title: string;
  detail: string;
  agent: string;
  kind:
    | "research"
    | "find_venues"
    | "find_vendors"
    | "draft_content"
    | "create_event"
    | "connect_platform"
    | "platform_action";
  level: "research" | "prepare" | "communicate" | "commit";
  depends_on: number[];
  input: Record<string, unknown>;
  lease_id: string;
  result: Record<string, unknown> | null;
};
type Plan = { id: string; title: string; goal: string; created_by: string };
export type Outcome = {
  status: "done" | "failed" | "waiting_approval" | "blocked" | "queued";
  detail: string;
  result?: Record<string, unknown>;
};
type Approval = { id: string; status: string };

export class RunnerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

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

const platformName = (id: string) => getConnector(id)?.name ?? id;

const defaults = {
  configured: () =>
    Boolean(
      process.env["PERPLEXITY_API_KEY"] &&
      process.env["SUPABASE_SERVICE_ROLE_KEY"] &&
      process.env["SUPABASE_URL"],
    ),
  async authorize(token: string, organizationId: string) {
    const db = database();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new RunnerError(401, "Sign in to run your agents.");
    const member = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (member.error || !member.data || !["owner", "admin", "organizer"].includes(member.data.role))
      throw new RunnerError(403, "An organization editor can run agent work.");
    return data.user.id;
  },
  async claim(actor: string, organizationId: string, planId: string) {
    const { data, error } = await database().rpc("claim_agent_task", {
      actor,
      workspace: organizationId,
      target_plan: planId,
    });
    if (error) throw new RunnerError(409, "This plan can't run right now. Refresh and try again.");
    return (data ?? null) as { task: AgentTask; plan: Plan } | null;
  },
  async finish(task: AgentTask, outcome: Outcome) {
    const { error } = await database().rpc("finish_agent_task", {
      target_task: task.id,
      lease: task.lease_id,
      outcome,
    });
    if (error)
      throw new RunnerError(409, "The step finished after its time ran out. It will run again.");
  },
  async waiting(planId: string) {
    const { data } = await database()
      .from("agent_tasks")
      .select("id,agent,input,result")
      .eq("plan_id", planId)
      .eq("status", "waiting_approval");
    return (data ?? []) as Pick<AgentTask, "id" | "agent" | "input" | "result">[];
  },
  async approval(organizationId: string, id: string) {
    const { data } = await database()
      .from("organizer_approvals")
      .select("id,status")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    return (data ?? null) as Approval | null;
  },
  async settleWaiting(taskId: string, outcome: Omit<Outcome, "result">) {
    await database().rpc("update_waiting_agent_task", { target_task: taskId, outcome });
  },
  async context(organizationId: string, plan: Plan, task: AgentTask) {
    const db = database();
    const [brief, earlier] = await Promise.all([
      db
        .from("organization_briefs")
        .select("area,mission,voice,event_goal")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db
        .from("agent_tasks")
        .select("position,title,status,status_detail,result")
        .eq("plan_id", plan.id)
        .eq("status", "done")
        .lt("position", task.position)
        .order("position"),
    ]);
    const role = task.agent !== "main" ? platformRoles[task.agent] : undefined;
    return {
      area: brief.data?.area ?? "",
      text: [
        `Plan goal: ${plan.goal}`,
        role
          ? `You are working as the ${platformName(task.agent)} agent (${role.role}): ${role.goal}`
          : "",
        brief.data ? `Organization brief: ${JSON.stringify(brief.data).slice(0, 2000)}` : "",
        // Each step builds on what earlier steps actually found.
        ...(earlier.data ?? []).map(
          (row) =>
            `Earlier step ${row.position} (${row.title}) found: ${String((row.result as { summary?: string } | null)?.summary ?? row.status_detail).slice(0, 900)}`,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
  research: (input: ResearchInput, context: string, mode?: "draft") =>
    researchCommunity(input, { context, ...(mode ? { mode } : {}) }),
  async saveKnowledge(
    organizationId: string,
    actor: string,
    title: string,
    result: ResearchResult,
  ) {
    await database()
      .from("organization_knowledge")
      .insert({
        organization_id: organizationId,
        title: title.slice(0, 200),
        content: `${result.answer.slice(0, 9000)}\nSources: ${JSON.stringify(result.sources).slice(0, 2000)}`,
        source_url: result.sources[0]?.url ?? "",
        created_by: actor,
      });
  },
  async remember(
    organizationId: string,
    agent: string,
    key: string,
    content: string,
    source: string,
  ) {
    const db = database();
    const platformAgent = await db
      .from("platform_agents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("platform", agent)
      .maybeSingle();
    if (!platformAgent.data) return;
    await db.from("agent_memory").upsert(
      {
        organization_id: organizationId,
        agent_id: platformAgent.data.id,
        memory_key: key,
        kind: "fact",
        content: content.slice(0, 2000),
        source_url: /^https?:\/\/[^\s@]+$/.test(source) && source.length <= 2048 ? source : "",
        expires_at: new Date(Date.now() + 180 * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,memory_key" },
    );
  },
  async connection(organizationId: string, connector: string) {
    const { data } = await database()
      .from("organization_connectors")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("connector", connector)
      .maybeSingle();
    return (data?.status as string | undefined) ?? "not_connected";
  },
  async createApproval(
    organizationId: string,
    actor: string,
    draft: { title: string; content: string; destination: string; kind: "post" | "message" },
  ) {
    const { data, error } = await database()
      .from("organizer_approvals")
      .insert({ organization_id: organizationId, created_by: actor, ...draft })
      .select("id")
      .single();
    if (error || !data) throw new Error("The draft could not be saved for review.");
    return data.id as string;
  },
  async dependencyDraft(planId: string, positions: number[]) {
    if (!positions.length) return null;
    const { data } = await database()
      .from("agent_tasks")
      .select("result")
      .eq("plan_id", planId)
      .eq("kind", "draft_content")
      .in("position", positions)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    return ((data?.result as { approvalId?: string; draft?: string } | null) ?? null) as {
      approvalId?: string;
      draft?: string;
    } | null;
  },
  async createEvent(
    organizationId: string,
    actor: string,
    event: {
      title: string;
      purpose: string;
      event_date: string;
      venue: string;
      geographic_area: string;
      budget_cents: number;
    },
  ) {
    const db = database();
    const { data, error } = await db
      .from("community_events")
      .insert({ organization_id: organizationId, created_by: actor, ...event })
      .select("id")
      .single();
    if (error || !data) throw new Error("The event could not be created.");
    await db.from("vendor_activity").insert({
      organization_id: organizationId,
      actor_id: actor,
      action: "community_event_planned",
    });
    return data.id as string;
  },
};
export type RunnerDeps = typeof defaults;

const purposeFor: Record<string, ResearchInput["purpose"]> = {
  research: "resources",
  find_venues: "venues",
  find_vendors: "vendors",
};
const askFor: Record<string, string> = {
  research: "",
  find_venues:
    " Compare accessible venues that could host this: location, capacity if published, accessibility, published pricing, booking contact, and what to confirm.",
  find_vendors:
    " List up to five local vendors or service providers that actually serve this area, with their published contact links and what to confirm. Do not contact them.",
};

export async function executeTask(
  deps: RunnerDeps,
  actor: string,
  plan: Plan,
  task: AgentTask,
): Promise<Outcome> {
  const org = task.organization_id;
  const input = task.input ?? {};
  const platform =
    typeof input["platform"] === "string" ? (input["platform"] as string) : task.agent;

  if (task.kind === "research" || task.kind === "find_venues" || task.kind === "find_vendors") {
    const context = await deps.context(org, plan, task);
    const result = await deps.research(
      {
        question: `${task.title}. ${task.detail}${askFor[task.kind]}`.slice(0, 3000),
        location: context.area.slice(0, 160),
        purpose: purposeFor[task.kind]!,
      },
      context.text,
    );
    await deps.saveKnowledge(org, actor, `${plan.title}: ${task.title}`, result).catch(() => {});
    if (task.agent !== "main")
      await deps
        .remember(
          org,
          task.agent,
          `plan:${task.id}`,
          `${task.title}: ${result.answer.slice(0, 1500)}`,
          result.sources[0]?.url ?? "",
        )
        .catch(() => {});
    return {
      status: "done",
      detail:
        task.kind === "find_vendors"
          ? `Found vendor candidates with ${result.sources.length} sources. Nobody has been contacted.`
          : task.kind === "find_venues"
            ? `Compared venue options with ${result.sources.length} sources. Nothing is booked.`
            : `Research saved with ${result.sources.length} sources.`,
      result: {
        summary: result.answer.slice(0, 6000),
        sources: result.sources.slice(0, 10),
        model: result.model,
      },
    };
  }

  if (task.kind === "draft_content") {
    const context = await deps.context(org, plan, task);
    const result = await deps.research(
      {
        question: `${task.title}. ${task.detail}`.slice(0, 3000),
        location: context.area.slice(0, 160),
        purpose: "general",
      },
      context.text,
      "draft",
    );
    const draft = result.answer.trim();
    if (draft.length < 10)
      return { status: "failed", detail: "The draft came back empty. Retry this step." };
    const destination =
      (typeof input["destination"] === "string" && (input["destination"] as string).trim()) ||
      (task.agent === "main"
        ? "Organization channels"
        : `${platformName(task.agent)} (not yet published)`);
    const approvalId = await deps.createApproval(org, actor, {
      title: task.title.slice(0, 200),
      content: draft.slice(0, 10000),
      destination: destination.slice(0, 500),
      kind: input["channel"] === "message" ? "message" : "post",
    });
    return {
      status: "done",
      detail: "Draft ready for your review in Approvals. Not published.",
      result: { approvalId, draft: draft.slice(0, 4000), summary: draft.slice(0, 600) },
    };
  }

  if (task.kind === "create_event") {
    const parsed = eventDraftSchema.safeParse({
      stage: "gathering",
      ...((input["event"] as object) ?? {}),
    });
    const event = parsed.success ? parsed.data : null;
    const missing = event ? missingEventDetails(event) : ["the event details"];
    if (!event || missing.length)
      return {
        status: "blocked",
        detail: `Needs ${missing.join(", ")}. Tell Civi in chat, then retry this step.`,
      };
    const title = (event.title ?? event.goal ?? plan.title).slice(0, 200);
    const purpose = [
      event.goal,
      event.audience && `For ${event.audience}`,
      `About ${event.attendance} people`,
      event.format === "virtual" ? "Virtual event" : "In-person event",
    ]
      .filter(Boolean)
      .join(". ");
    const eventId = await deps.createEvent(org, actor, {
      title: title.length >= 3 ? title : "Community gathering",
      purpose: purpose.length >= 10 ? purpose : `${purpose} · community gathering`,
      event_date: event.date!,
      venue: event.venue ?? "",
      geographic_area: (event.format === "virtual"
        ? `Online · ${event.location}`
        : event.location!
      ).slice(0, 160),
      budget_cents: Math.round((event.budgetUsd ?? 0) * 100),
    });
    return {
      status: "done",
      detail: `Event “${title}” created as a draft in Events.`,
      result: { eventId, summary: `Event created for ${event.date}.` },
    };
  }

  if (task.kind === "connect_platform") {
    const status = await deps.connection(org, platform);
    return status === "connected"
      ? { status: "done", detail: `${platformName(platform)} is connected.` }
      : {
          status: "blocked",
          detail: `Connect ${platformName(platform)} in Connections, then retry this step.`,
          result: { needs: "connection", connector: platform },
        };
  }

  // platform_action: communicating on a platform always needs the account and a person's approval.
  const status = await deps.connection(org, platform);
  if (status !== "connected")
    return {
      status: "blocked",
      detail: `Needs ${platformName(platform)} connected before this can happen.`,
      result: { needs: "connection", connector: platform },
    };
  const prior = await deps.dependencyDraft(plan.id, task.depends_on ?? []);
  const action =
    typeof input["action"] === "string"
      ? (input["action"] as string).replaceAll("_", " ")
      : "publish";
  const approvalId =
    prior?.approvalId ??
    (await deps.createApproval(org, actor, {
      title: task.title.slice(0, 200),
      content: (prior?.draft ?? `${task.title}. ${task.detail}`).slice(0, 10000).padEnd(10, "."),
      destination: `${platformName(platform)} · ${action}`.slice(0, 500),
      kind: input["action"] === "message" ? "message" : "post",
    }));
  return {
    status: "waiting_approval",
    detail: `Waiting for your approval to ${action} on ${platformName(platform)}.`,
    result: { approvalId, needs: "approval", connector: platform },
  };
}

/** Steps waiting on an approval move on once a person decides. */
async function settleApprovals(deps: RunnerDeps, organizationId: string, planId: string) {
  for (const task of await deps.waiting(planId)) {
    const approvalId = (task.result as { approvalId?: string } | null)?.approvalId;
    if (!approvalId) continue;
    const approval = await deps.approval(organizationId, approvalId);
    if (!approval || approval.status === "pending") continue;
    const platform =
      typeof task.input?.["platform"] === "string"
        ? (task.input["platform"] as string)
        : task.agent;
    await deps.settleWaiting(
      task.id,
      approval.status === "approved"
        ? {
            status: "blocked",
            detail: `Approved. Automatic ${platformName(platform)} publishing isn't switched on yet, so post it yourself or take over in the agent browser.`,
          }
        : { status: "cancelled" as Outcome["status"], detail: "Declined in Approvals." },
    );
  }
}

const bodySchema = z
  .object({ organizationId: z.string().uuid(), planId: z.string().uuid() })
  .strict();

export async function handleAgentRun(request: Request, overrides: Partial<RunnerDeps> = {}) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site requests are not allowed." }, 403);
  const token = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!token) return json({ error: "Sign in to run your agents." }, 401);
  if (!deps.configured())
    return json({ error: "Agent work isn't configured on this deployment yet." }, 503);
  let claimed: { task: AgentTask; plan: Plan } | null = null;
  try {
    const text = await request.text();
    if (text.length > 2048) throw new RunnerError(413, "Request too large.");
    const parsed = bodySchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new RunnerError(400, "Choose a plan to run.");
    const { organizationId, planId } = parsed.data;
    const actor = await deps.authorize(token, organizationId);
    await settleApprovals(deps, organizationId, planId);
    claimed = await deps.claim(actor, organizationId, planId);
    if (!claimed) return json({ ran: null });
    let outcome: Outcome;
    try {
      outcome = await executeTask(deps, actor, claimed.plan, claimed.task);
    } catch (failure) {
      // Report the real failure; never fake success.
      outcome = {
        status: "failed",
        detail:
          failure instanceof ResearchError
            ? failure.message
            : failure instanceof Error && failure.message.length < 200
              ? failure.message
              : "This step failed. Retry it, or tell Civi what to change.",
      };
    }
    await deps.finish(claimed.task, outcome);
    return json({
      ran: {
        id: claimed.task.id,
        title: claimed.task.title,
        status: outcome.status,
        detail: outcome.detail,
      },
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof RunnerError
            ? error.message
            : error instanceof SyntaxError
              ? "Send valid JSON."
              : "Agent work could not run. Try again.",
      },
      error instanceof RunnerError ? error.status : 500,
    );
  }
}
