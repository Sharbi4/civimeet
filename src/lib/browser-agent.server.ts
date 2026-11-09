import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  allowedUrl,
  browserAgentInstructions,
  browserConnectorFor,
  checkAction,
  describeAction,
  safetyCheckText,
  isSignInPage,
  keyDefinition,
  platformHome,
  platformHosts,
} from "./browser-agent-policy";
import { getConnector } from "./connectors";
import {
  museModels,
  type MuseModel,
  MuseError,
  museConfigured,
  museModel,
  museTurn,
  type ComputerAction,
  type ComputerCall,
  type MuseTurn,
  type SafetyCheck,
} from "./muse.server";
import {
  SteelProtocolError,
  SteelRequestError,
  steelProvider,
  withSteelPage,
  type SteelPage,
} from "./steel.server";

// Computer-use execution: Muse Wonder decides, Steel runs the browser, Civi enforces the
// permissions. Each request performs one verified step (screenshot → model → policy check →
// actions → evidence) so pause, stop, take-over and safety checks apply between steps.
type Run = {
  id: string;
  organization_id: string;
  connector: string;
  agent: string;
  objective: string;
  model: string;
  status: "running" | "waiting_for_human" | "paused" | "succeeded" | "failed" | "cancelled";
  step_count: number;
  max_steps: number;
  current_url: string;
  usage: Record<string, number>;
  created_by: string;
};
type Runtime = {
  provider_session: string | null;
  profile_id: string | null;
  previous_response_id: string | null;
  pending_call: (Pick<ComputerCall, "call_id" | "actions"> & { note?: string }) | null;
  pending_safety_checks: SafetyCheck[] | null;
  acknowledged_safety_checks: SafetyCheck[] | null;
  lease_id: string;
};
type Event = { kind: string; summary: string; detail?: Record<string, unknown>; step?: number };
type Outcome = {
  status?: Run["status"];
  detail?: string;
  steps?: number;
  currentAction?: string;
  currentUrl?: string;
  result?: Record<string, unknown>;
  usage?: Record<string, number>;
  model?: string;
  providerSession?: string;
  profileId?: string;
  previousResponseId?: string;
  pendingCall?: Runtime["pending_call"];
  pendingSafetyChecks?: SafetyCheck[] | null;
  acknowledgedSafetyChecks?: SafetyCheck[] | null;
};
export class AgentBrowserError extends Error {
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
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await database().rpc(name, args);
  if (error) {
    const known =
      /owner or administrator|already working|allowance|still working|Unknown run|lease expired/i.exec(
        error.message,
      );
    throw new AgentBrowserError(
      known ? (/administrator/.test(error.message) ? 403 : 409) : 500,
      known ? error.message : "The agent browser couldn't save its progress.",
    );
  }
  return data as T;
}

const defaults = {
  env: process.env as Record<string, string | undefined>,
  async authorize(token: string, organizationId: string) {
    const db = database();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new AgentBrowserError(401, "Sign in to use the agent browser.");
    const member = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (member.error || !member.data || !["owner", "admin"].includes(member.data.role))
      throw new AgentBrowserError(
        403,
        "Only an organization owner or administrator can run the agent browser.",
      );
    return { actor: data.user.id, organization: organizationId };
  },
  organizationName: async (organizationId: string) =>
    ((await database().from("organizations").select("name").eq("id", organizationId).maybeSingle())
      .data?.name as string | undefined) ?? "the organization",
  startRun: (
    actor: string,
    organizationId: string,
    connector: string,
    objective: string,
    model: string,
    chatActionId: string | null,
  ) =>
    rpc<string>("start_browser_agent_run", {
      actor,
      workspace: organizationId,
      target: connector,
      run_objective: objective,
      run_model: model,
      steps: 12,
      chat_action: chatActionId,
    }),
  claim: (actor: string, organizationId: string, runId: string) =>
    rpc<{ run: Run; runtime: Runtime }>("claim_browser_agent_run", {
      actor,
      workspace: organizationId,
      target_run: runId,
      lease_seconds: 150,
    }),
  finish: (runId: string, lease: string, outcome: Outcome, events: Event[]) =>
    rpc<void>("finish_browser_agent_step", { target_run: runId, lease, outcome, events }),
  connectorProfile: (organizationId: string, connector: string) =>
    rpc<{ profileId: string | null; providerSession: string | null; status: string } | null>(
      "connector_browser_profile",
      { workspace: organizationId, target: connector },
    ),
  provider: steelProvider as Pick<typeof steelProvider, "create" | "release" | "live">,
  page: withSteelPage as <T>(
    sessionId: string,
    work: (page: SteelPage) => Promise<T>,
    timeoutMs?: number,
  ) => Promise<T>,
  muse: museTurn,
  newSessionId: () => crypto.randomUUID(),
  async remember(run: Run, summary: string, url: string) {
    const db = database();
    const agent = await db
      .from("platform_agents")
      .select("id")
      .eq("organization_id", run.organization_id)
      .eq("platform", run.connector)
      .maybeSingle();
    if (!agent.data) return;
    await db.from("agent_memory").upsert(
      {
        organization_id: run.organization_id,
        agent_id: agent.data.id,
        memory_key: `browser:${run.id}`,
        kind: "fact",
        content: `Browser task “${run.objective.slice(0, 200)}” (verified, read-only): ${summary.slice(0, 1500)}`,
        source_url: allowedUrl(url, run.connector)
          ? new URL(url).origin + new URL(url).pathname
          : "",
        expires_at: new Date(Date.now() + 180 * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,memory_key" },
    );
  },
};
export type AgentBrowserDeps = typeof defaults;

export function agentBrowserStatus(env: Record<string, string | undefined> = process.env) {
  const missing = [
    ...(museConfigured(env) ? [] : ["MUSE_API_KEY"]),
    ...(env["STEEL_API_KEY"] ? [] : ["STEEL_API_KEY"]),
  ];
  return json({ configured: missing.length === 0, model: museModel(env), missing });
}

const commandSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("start"),
      organizationId: z.string().uuid(),
      platform: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
      objective: z.string().trim().min(3).max(1000),
      chatActionId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      command: z.enum([
        "step",
        "pause",
        "resume",
        "stop",
        "takeover",
        "release",
        "approve_safety",
        "decline_safety",
      ]),
      organizationId: z.string().uuid(),
      runId: z.string().uuid(),
    })
    .strict(),
]);

const safePath = (raw: string) => {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
};
const platformName = (id: string) => getConnector(id)?.name ?? id;

function addUsage(total: Record<string, number>, turn: MuseTurn) {
  return {
    input_tokens: (total["input_tokens"] ?? 0) + turn.usage.input_tokens,
    cached_tokens: (total["cached_tokens"] ?? 0) + turn.usage.cached_tokens,
    output_tokens: (total["output_tokens"] ?? 0) + turn.usage.output_tokens,
    cost_usd: Number(((total["cost_usd"] ?? 0) + turn.usage.cost_usd).toFixed(6)),
    model_calls: (total["model_calls"] ?? 0) + 1,
  };
}

/** Check one proposed action against what is actually under the cursor or focused right now. */
async function assess(page: SteelPage, connector: string, action: ComputerAction) {
  const needsPoint = action.type === "click" || action.type === "double_click";
  const point = needsPoint ? await page.inspectPoint(action.x, action.y) : null;
  const focus =
    action.type === "type" || action.type === "keypress" ? await page.activeElement() : null;
  const decision = checkAction(action, { connector, point, focus });
  const label = describeAction(action) + (point?.text ? ` (“${point.text.slice(0, 60)}”)` : "");
  return { decision, label };
}

export type ProposedAction = { summary: string; allowed: boolean; reason?: string };
/** What the model wants to do, and whether Civi's read-only policy would let it, without doing it. */
async function previewActions(
  page: SteelPage,
  connector: string,
  actions: ComputerAction[],
): Promise<ProposedAction[]> {
  const preview: ProposedAction[] = [];
  for (const action of actions.slice(0, 6)) {
    const { decision, label } = await assess(page, connector, action);
    preview.push(
      decision.allowed
        ? { summary: label, allowed: true }
        : { summary: label, allowed: false, reason: decision.reason },
    );
  }
  return preview;
}

/** Run a batch of model actions, checking each against the page before it happens. */
async function runActions(
  page: SteelPage,
  connector: string,
  actions: ComputerAction[],
  step: number,
) {
  const events: Event[] = [];
  let note: string | undefined;
  let human: string | undefined;
  for (const action of actions) {
    const { decision, label } = await assess(page, connector, action);
    if (!decision.allowed) {
      events.push({ kind: "blocked", step, summary: `Blocked: ${label}. ${decision.reason}` });
      note = `The app blocked your last action (${label}): ${decision.reason} Continue in read-only mode without it, or finish with your report.`;
      if (decision.human) human = decision.reason;
      break;
    }
    switch (action.type) {
      case "click":
        if (action.button === "back" || action.button === "forward") await page.historyBack();
        else
          await page.clickAt(action.x, action.y, action.button === "wheel" ? "middle" : "left", 1);
        break;
      case "double_click":
        await page.clickAt(action.x, action.y, "left", 2);
        break;
      case "move":
        await page.mouse("mouseMoved", action.x, action.y);
        break;
      case "scroll":
        await page.wheel(
          action.x,
          action.y,
          Math.max(-2000, Math.min(2000, action.scroll_x)),
          Math.max(-2000, Math.min(2000, action.scroll_y)),
        );
        break;
      case "type":
        await page.insertText(action.text.slice(0, 200));
        break;
      case "keypress":
        for (const key of action.keys) {
          const definition = keyDefinition(key);
          await page.key(definition.key, definition.code, definition.keyCode, 0, definition.text);
        }
        break;
      case "wait":
        await new Promise((resolve) => setTimeout(resolve, 1500));
        break;
      case "screenshot":
      case "drag":
        break;
    }
    events.push({ kind: "action", step, summary: label });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { events, note, human };
}

export async function handleAgentBrowser(
  request: Request,
  overrides: Partial<AgentBrowserDeps> = {},
) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site requests are not allowed." }, 403);
  const token = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!token) return json({ error: "Sign in to use the agent browser." }, 401);
  try {
    const text = await request.text();
    if (text.length > 4096) throw new AgentBrowserError(413, "Request too large.");
    const parsed = commandSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new AgentBrowserError(400, "Invalid agent browser request.");
    const input = parsed.data;
    const { actor } = await deps.authorize(token, input.organizationId);
    if (input.command === "start") return json(await start(deps, actor, input));
    return json(await control(deps, actor, input.organizationId, input.runId, input.command));
  } catch (error) {
    const message =
      error instanceof AgentBrowserError ||
      error instanceof MuseError ||
      error instanceof SteelRequestError ||
      error instanceof SteelProtocolError
        ? error.message
        : error instanceof SyntaxError
          ? "Send valid JSON."
          : "The agent browser step couldn't be completed.";
    return json(
      { error: message },
      error instanceof AgentBrowserError
        ? error.status
        : error instanceof MuseError
          ? error.status === 503
            ? 503
            : 502
          : 502,
    );
  }
}

async function start(
  deps: AgentBrowserDeps,
  actor: string,
  input: {
    organizationId: string;
    platform: string;
    objective: string;
    chatActionId?: string | undefined;
  },
) {
  if (!museConfigured(deps.env))
    throw new AgentBrowserError(
      503,
      "Muse Wonder isn't set up yet. Add MUSE_API_KEY to the server secrets to let Civi work in the browser.",
    );
  if (!deps.env["STEEL_API_KEY"])
    throw new AgentBrowserError(
      503,
      "The agent browser isn't configured on this deployment yet (Steel API key).",
    );
  const connector = browserConnectorFor(input.platform);
  if (!platformHosts[connector])
    throw new AgentBrowserError(400, `${platformName(connector)} can't be browsed by the agent.`);
  // Social platforms are browsed only through their own connection and its permissions.
  const profile = await deps.connectorProfile(input.organizationId, connector);
  if (!profile || profile.status !== "connected" || !profile.profileId)
    throw new AgentBrowserError(
      409,
      `Connect ${platformName(connector)} first. Say “open ${platformName(connector)}” and sign in.`,
    );
  if (profile.providerSession)
    throw new AgentBrowserError(
      409,
      `${platformName(connector)} is open for sign-in or take-over right now. Close that browser first.`,
    );
  const runId = await deps.startRun(
    actor,
    input.organizationId,
    connector,
    input.objective,
    museModel(deps.env),
    input.chatActionId ?? null,
  );
  return { runId, status: "running" };
}

async function control(
  deps: AgentBrowserDeps,
  actor: string,
  organizationId: string,
  runId: string,
  command: string,
) {
  const { run, runtime } = await deps.claim(actor, organizationId, runId);
  const finish = (outcome: Outcome, events: Event[] = []) =>
    deps.finish(run.id, runtime.lease_id, outcome, events);
  const release = async () => {
    if (runtime.provider_session)
      await deps.provider.release(runtime.provider_session).catch(() => {});
  };
  const ended = ["succeeded", "failed", "cancelled"].includes(run.status);
  if (ended) {
    await finish({});
    return { status: run.status };
  }
  if (command === "stop") {
    await release();
    await finish(
      {
        status: "cancelled",
        detail: "Stopped by the team.",
        providerSession: "",
        currentAction: "",
      },
      [{ kind: "human", summary: "Stopped by the team" }],
    );
    return { status: "cancelled" };
  }
  if (command === "pause") {
    await finish({ status: "paused", detail: "Paused by the team.", currentAction: "" }, [
      { kind: "human", summary: "Paused" },
    ]);
    return { status: "paused" };
  }
  if (command === "resume") {
    await finish({ status: "running", detail: "" }, [{ kind: "human", summary: "Resumed" }]);
    return { status: "running" };
  }
  if (command === "takeover") {
    if (!runtime.provider_session) {
      await finish({});
      throw new AgentBrowserError(409, "There's no open browser to take over yet.");
    }
    const live = await deps.provider.live(runtime.provider_session, true);
    if (!live.live) {
      await finish({ providerSession: "" });
      throw new AgentBrowserError(
        409,
        "That browser window closed. Resume and the agent will reopen it.",
      );
    }
    await finish(
      {
        status: "waiting_for_human",
        detail: "You're in control. Hand back when you're done.",
        currentAction: "You're in control",
      },
      [{ kind: "human", summary: "Taken over by the team" }],
    );
    return { status: "waiting_for_human", viewer: live.viewer };
  }
  if (command === "release") {
    if (runtime.pending_safety_checks?.length) {
      await finish({});
      throw new AgentBrowserError(409, "Decide on the safety check first.");
    }
    await finish({ status: "running", detail: "", currentAction: "" }, [
      { kind: "human", summary: "Control returned to Civi" },
    ]);
    return { status: "running" };
  }
  if (command === "decline_safety") {
    await release();
    await finish(
      {
        status: "cancelled",
        detail: "Stopped: a safety check was declined.",
        providerSession: "",
        pendingSafetyChecks: null,
        pendingCall: null,
      },
      [{ kind: "safety_check", summary: "Safety check declined; run stopped" }],
    );
    return { status: "cancelled" };
  }
  if (command === "approve_safety") {
    if (
      !runtime.pending_safety_checks?.length ||
      !runtime.pending_call ||
      !runtime.provider_session
    ) {
      await finish({});
      throw new AgentBrowserError(409, "There's no safety check waiting.");
    }
    const checks = runtime.pending_safety_checks;
    const pending = runtime.pending_call;
    // Approval acknowledges Meta's check; Civi's own read-only policy still applies to each action.
    const executed = await deps.page(
      runtime.provider_session,
      (page) => runActions(page, run.connector, pending.actions, run.step_count),
      40_000,
    );
    await finish(
      {
        status: "running",
        detail: "",
        pendingSafetyChecks: null,
        acknowledgedSafetyChecks: checks,
        pendingCall: {
          call_id: pending.call_id,
          actions: [],
          ...(executed.note ? { note: executed.note } : {}),
        },
      },
      [
        {
          kind: "safety_check",
          summary: `Safety check approved: ${checks
            .map((check) => check.message ?? check.code ?? check.id)
            .join("; ")
            .slice(0, 300)}`,
        },
        ...executed.events,
      ],
    );
    return { status: "running" };
  }
  try {
    return await step(deps, run, runtime, finish);
  } catch (failure) {
    // Never leave a run looking active after a failed step: close the browser, record the real error.
    const message =
      failure instanceof MuseError ||
      failure instanceof AgentBrowserError ||
      failure instanceof SteelRequestError ||
      failure instanceof SteelProtocolError
        ? failure.message
        : "The browser step failed.";
    await release();
    await finish({ status: "failed", detail: message, providerSession: "", currentAction: "" }, [
      { kind: "error", summary: message.slice(0, 400) },
    ]).catch(() => {});
    return { status: "failed", detail: message };
  }
}

async function step(
  deps: AgentBrowserDeps,
  run: Run,
  runtime: Runtime,
  finish: (outcome: Outcome, events?: Event[]) => Promise<void>,
) {
  if (run.status !== "running") {
    await finish({});
    return { status: run.status };
  }
  const stepNumber = run.step_count + 1;
  if (run.step_count >= run.max_steps) {
    if (runtime.provider_session)
      await deps.provider.release(runtime.provider_session).catch(() => {});
    await finish(
      {
        status: "failed",
        detail: `Stopped after ${run.max_steps} steps without finishing. Try a narrower request.`,
        providerSession: "",
      },
      [{ kind: "error", summary: "Step limit reached" }],
    );
    return { status: "failed" };
  }
  const events: Event[] = [];
  let session = runtime.provider_session;
  let profile = runtime.profile_id;
  // Reconnect the Steel browser if it was never opened or has expired.
  if (session) {
    const live = await deps.provider
      .live(session, false)
      .catch(() => ({ live: false, viewer: "" }));
    if (!live.live) session = null;
  }
  if (!session) {
    if (!profile) {
      const connection = await deps.connectorProfile(run.organization_id, run.connector);
      if (!connection || connection.status !== "connected" || !connection.profileId) {
        await finish(
          {
            status: "failed",
            detail: `${platformName(run.connector)} isn't connected any more. Connect it again, then retry.`,
          },
          [{ kind: "error", summary: "Connection missing" }],
        );
        return { status: "failed" };
      }
      profile = connection.profileId;
    }
    const created = await deps.provider.create(deps.newSessionId(), true, profile);
    session = created.id;
    profile = created.profileId ?? profile;
    const resume =
      run.current_url && allowedUrl(run.current_url, run.connector)
        ? run.current_url
        : platformHome[run.connector]!;
    await deps.page(session, async (page) => {
      try {
        await page.navigate(resume);
      } catch {
        /* the next screenshot shows where it landed */
      }
    });
    events.push({
      kind: "observed",
      step: stepNumber,
      summary: `Opened ${platformName(run.connector)} in the agent browser`,
    });
  }
  const sessionId = session;
  const instructions = browserAgentInstructions(
    platformName(run.connector),
    await deps.organizationName(run.organization_id),
  );
  const result = await deps.page(
    sessionId,
    async (page) => {
      const before = await page.location();
      if (isSignInPage(before.url))
        return {
          human: `${platformName(run.connector)} is asking you to sign in or verify. Take control, then hand back.`,
          url: before.url,
        } as const;
      let note = runtime.pending_call?.note;
      if (!allowedUrl(before.url, run.connector)) {
        await page.historyBack();
        note = `${note ? `${note} ` : ""}The page left ${platformName(run.connector)}, so the app went back. Stay on ${platformName(run.connector)}.`;
      }
      const shot = await page.capture();
      const turn: MuseTurn =
        runtime.previous_response_id && runtime.pending_call
          ? await deps.muse(
              {
                kind: "continue",
                instructions,
                previousResponseId: runtime.previous_response_id,
                callId: runtime.pending_call.call_id,
                screenshot: shot.dataUrl,
                acknowledged: runtime.acknowledged_safety_checks ?? [],
                note,
              },
              {
                model: (museModels as readonly string[]).includes(run.model)
                  ? (run.model as MuseModel)
                  : undefined,
              },
            )
          : await deps.muse(
              {
                kind: "start",
                instructions,
                task: `Task from the team: ${run.objective}`,
                screenshot: shot.dataUrl,
              },
              {
                model: (museModels as readonly string[]).includes(run.model)
                  ? (run.model as MuseModel)
                  : undefined,
              },
            );
      const usage = addUsage(run.usage ?? {}, turn);
      if (!turn.call)
        return { turn, usage, url: before.url, title: before.title, done: true } as const;
      if (turn.call.pending_safety_checks.length)
        return {
          turn,
          usage,
          url: before.url,
          safety: turn.call.pending_safety_checks,
          proposed: await previewActions(page, run.connector, turn.call.actions),
          screenshot: shot.dataUrl,
        } as const;
      const executed = await runActions(page, run.connector, turn.call.actions, stepNumber);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const after = await page.location();
      const frame = await page.capture();
      return { turn, usage, executed, url: after.url, screenshot: frame.dataUrl } as const;
    },
    55_000,
  );
  const base: Outcome = { providerSession: sessionId, profileId: profile ?? "" };
  if ("human" in result && result.human) {
    await finish(
      {
        ...base,
        status: "waiting_for_human",
        detail: result.human,
        currentAction: "Waiting for you",
        currentUrl: safePath(result.url),
      },
      [...events, { kind: "human", step: stepNumber, summary: result.human }],
    );
    return { status: "waiting_for_human", detail: result.human };
  }
  const turn = result.turn!;
  // Meta may only offer computer use on Muse Spark for this account; say so, and keep the run on it.
  const switched = turn.model !== run.model;
  if (switched) {
    base.model = turn.model;
    events.push({
      kind: "model",
      step: stepNumber,
      summary: `${run.model} doesn't accept computer use on this Meta account yet, so this run uses ${turn.model}.`,
    });
  }
  if ("done" in result && result.done) {
    const message = turn.message || "I finished, but didn't write a report.";
    if (/^NEED_HUMAN:/i.test(message)) {
      const detail =
        message.replace(/^NEED_HUMAN:\s*/i, "").slice(0, 900) ||
        "The agent needs you to take over.";
      await finish(
        {
          ...base,
          status: "waiting_for_human",
          detail,
          usage: result.usage,
          previousResponseId: turn.id,
          pendingCall: null,
          currentAction: "Waiting for you",
        },
        [...events, { kind: "human", step: stepNumber, summary: detail.slice(0, 300) }],
      );
      return { status: "waiting_for_human", detail };
    }
    // Verified completion: the report is tied to the page the browser was actually on.
    const evidence = {
      summary: message.slice(0, 6000),
      url: safePath(result.url),
      title: result.title,
      steps: stepNumber,
    };
    await deps.provider.release(sessionId).catch(() => {});
    await deps.remember(run, message, result.url).catch(() => {});
    await finish(
      {
        ...base,
        status: "succeeded",
        detail: "Done.",
        result: evidence,
        usage: result.usage,
        providerSession: "",
        previousResponseId: turn.id,
        pendingCall: null,
        currentAction: "",
        currentUrl: safePath(result.url),
        steps: 1,
      },
      [
        ...events,
        {
          kind: "result",
          step: stepNumber,
          summary: message.slice(0, 400),
          detail: { url: evidence.url, title: evidence.title },
        },
      ],
    );
    return { status: "succeeded", result: evidence };
  }
  if ("safety" in result && result.safety) {
    const proposed = result.proposed ?? [];
    const detail = `Meta flagged the next action for review: ${result.safety
      .map(safetyCheckText)
      .join(" ")
      .slice(0, 600)}`;
    const plan = proposed.length
      ? ` Proposed: ${proposed
          .map((action) => `${action.summary}${action.allowed ? "" : " (Civi would block this)"}`)
          .join("; ")
          .slice(0, 300)}`
      : "";
    await finish(
      {
        ...base,
        status: "waiting_for_human",
        detail,
        usage: result.usage,
        previousResponseId: turn.id,
        pendingCall: { call_id: turn.call!.call_id, actions: turn.call!.actions },
        pendingSafetyChecks: result.safety,
        acknowledgedSafetyChecks: null,
        currentAction: "Waiting for your decision",
        currentUrl: safePath(result.url),
        steps: 1,
      },
      [
        ...events,
        ...(turn.message
          ? [{ kind: "model", step: stepNumber, summary: turn.message.slice(0, 400) }]
          : []),
        { kind: "safety_check", step: stepNumber, summary: `${detail}${plan}`.slice(0, 450) },
      ],
    );
    return {
      status: "waiting_for_human",
      detail,
      safetyChecks: result.safety,
      proposed,
      url: safePath(result.url),
      ...(result.screenshot ? { screenshot: result.screenshot } : {}),
    };
  }
  const executed =
    "executed" in result ? result.executed! : { events: [], note: undefined, human: undefined };
  const lastAction = executed.events.at(-1)?.summary ?? "Looked at the page";
  await finish(
    {
      ...base,
      status: executed.human ? "waiting_for_human" : "running",
      detail: executed.human ?? "",
      usage: result.usage,
      previousResponseId: turn.id,
      pendingCall: {
        call_id: turn.call!.call_id,
        actions: [],
        ...(executed.note ? { note: executed.note } : {}),
      },
      acknowledgedSafetyChecks: null,
      currentAction: lastAction.slice(0, 300),
      currentUrl: safePath(result.url),
      steps: 1,
    },
    [
      ...events,
      ...(turn.message
        ? [{ kind: "model", step: stepNumber, summary: turn.message.slice(0, 400) }]
        : []),
      ...executed.events,
    ],
  );
  return {
    status: executed.human ? "waiting_for_human" : "running",
    currentAction: lastAction,
    url: safePath(result.url),
    ...("screenshot" in result && result.screenshot ? { screenshot: result.screenshot } : {}),
  };
}
