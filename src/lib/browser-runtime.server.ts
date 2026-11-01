import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import {
  approvedBrowserUrl,
  browserCommandSchema,
  type BrowserCommand,
  type BrowserState,
  type BrowserWorkspace,
} from "./browser-workspace";
import {
  SteelProtocolError,
  SteelRequestError,
  steelProvider,
  withSteelPage,
} from "./steel.server";

type Runtime = {
  provider_session: string | null;
  profile_id: string | null;
  checkpoint_url: string;
  operation_id: string | null;
};
type Claim = { workspace: BrowserWorkspace; runtime: Runtime };
type Result = {
  state: BrowserState;
  origin: string;
  task: string;
  humanActor: string | null;
  expiresAt: string | null;
  providerSession: string | null;
  profileId: string | null;
  checkpointUrl: string;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
class BrowserError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
        return fetch(input, { ...init, headers, signal: AbortSignal.timeout(10_000) });
      },
    },
  });
}
export function browserRuntimeStatus() {
  return json({
    configured: Boolean(
      process.env["STEEL_API_KEY"] &&
      process.env["SUPABASE_SERVICE_ROLE_KEY"] &&
      process.env["SUPABASE_URL"],
    ),
    provider: "steel",
    handoffEnabled: process.env["STEEL_HUMAN_HANDOFF_ENABLED"] === "true",
  });
}
export async function browserOrigins(organizationId: string): Promise<string[]> {
  const { data, error } = await database()
    .from("browser_sites")
    .select("origin")
    .eq("organization_id", organizationId);
  if (error) throw new Error("Could not verify approved websites.");
  return (data ?? []).map((row) => row.origin as string);
}
const defaults = {
  async authorize(token: string, organizationId: string) {
    const db = database();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new BrowserError(401, "Sign in to use the browser workspace.");
    const member = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (member.error || !member.data || !["owner", "admin"].includes(member.data.role))
      throw new BrowserError(403, "An organization administrator must open this browser.");
    return data.user.id;
  },
  async claim(actor: string, input: BrowserCommand): Promise<Claim> {
    const { data, error } = await database().rpc("claim_browser_operation", {
      actor,
      workspace: input.organizationId,
      target_agent: input.agentId,
      request_key: input.requestId,
      operation: input.command,
    });
    if (error)
      throw new BrowserError(
        409,
        "Browser busy or unavailable. Refresh; stop an interrupted session before reconnecting.",
      );
    return data;
  },
  async finish(id: string, result: Result, success: boolean) {
    const { error } = await database().rpc("finish_browser_operation", {
      request_key: id,
      result,
      success,
    });
    if (error) throw new Error("Browser state could not be saved.");
  },
  provider: steelProvider as Pick<typeof steelProvider, "create" | "release" | "live">,
  page: withSteelPage,
  origins: browserOrigins,
  handoff: () => process.env["STEEL_HUMAN_HANDOFF_ENABLED"] === "true",
};

export async function handleBrowserCommand(
  request: Request,
  overrides: Partial<typeof defaults> = {},
) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site browser requests are not allowed." }, 403);
  const token = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!token) return json({ error: "Sign in to use the browser workspace." }, 401);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "Send JSON." }, 415);
  let input: BrowserCommand;
  let result: Result | null = null;
  let phase = "request";
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new BrowserError(400, "Provide a browser command.");
    let text = "";
    const decoder = new TextDecoder();
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 8192) {
          await reader.cancel();
          throw new BrowserError(413, "Browser request is too large.");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const parsed = browserCommandSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new BrowserError(400, "Invalid browser command.");
    input = parsed.data;
    phase = "authorization";
    const actor = await deps.authorize(token, input.organizationId);
    const origins = await deps.origins(input.organizationId);
    if (input.command === "takeover" && !deps.handoff())
      throw new BrowserError(
        409,
        "Human control is awaiting the private-login verification check.",
      );
    if (input.command === "start" && !origins.length)
      throw new BrowserError(
        409,
        "Your administrator needs to enable an authorized website first.",
      );
    if (input.url) approvedBrowserUrl(input.url, origins);
    phase = "reservation";
    const { workspace, runtime } = await deps.claim(actor, input);
    result = {
      state: workspace.state,
      origin: workspace.current_origin,
      task: workspace.task,
      humanActor: workspace.human_actor,
      expiresAt: workspace.expires_at,
      providerSession: runtime.provider_session,
      profileId: runtime.profile_id,
      checkpointUrl: runtime.checkpoint_url,
    };
    let screenshot: string | undefined;
    let viewer: string | undefined;
    const stop = async () => {
      phase = "provider_stop";
      if (result!.providerSession) await deps.provider.release(result!.providerSession);
      result!.providerSession = null;
      result!.humanActor = null;
      result!.expiresAt = null;
    };

    if (input.command === "disconnect" || input.command === "pause") {
      await stop();
      // An uncertain create may have reached Steel before the app lost its response.
      if (runtime.operation_id) await deps.provider.release(runtime.operation_id);
      result.state = input.command === "pause" ? "paused" : "not_connected";
      if (input.command === "disconnect") {
        result.profileId = null;
        result.checkpointUrl = "";
        result.origin = "";
      }
    } else if (["start", "takeover", "resume"].includes(input.command)) {
      if (input.command === "start" && result.providerSession)
        throw new BrowserError(409, "Stop the current browser before starting another.");
      if (input.command === "resume" && result.humanActor && result.humanActor !== actor)
        throw new BrowserError(403, "The administrator in control must return this browser.");
      if (input.command === "takeover" && result.humanActor && result.humanActor !== actor)
        throw new BrowserError(
          409,
          "Another administrator controls this browser. Stop it to revoke access.",
        );
      const checkpoint = input.url ?? result.checkpointUrl ?? "";
      if (checkpoint) approvedBrowserUrl(checkpoint, origins);
      await stop();
      // The provider session is rotated before handing control to a different principal.
      // Old interactive viewer URLs can never address the new agent session.
      result.providerSession = input.requestId;
      phase = "provider_create";
      const created = await deps.provider.create(
        input.requestId,
        input.command === "takeover",
        result.profileId,
      );
      result.profileId = created.profileId;
      result.expiresAt = new Date(Date.now() + 300_000).toISOString();
      result.task = input.command === "start" ? input.task : result.task;
      result.humanActor = input.command === "takeover" ? actor : null;
      result.state = input.command === "takeover" ? "human_controlling" : "ready";
      result.checkpointUrl = checkpoint;
      phase = "page_connection";
      if (checkpoint)
        await deps.page(created.id, async (page) => {
          await page.navigate(checkpoint);
          const inspection = await page.inspect();
          if (inspection.url !== "about:blank") approvedBrowserUrl(inspection.url, origins);
          result!.origin = new URL(inspection.url).origin;
          if (inspection.sensitive && input.command !== "takeover")
            result!.state = "authentication_required";
          if (!inspection.sensitive && input.command !== "takeover")
            screenshot = await page.screenshot();
        });
      if (input.command === "takeover") viewer = created.viewer;
    } else {
      if (!result.providerSession)
        throw new BrowserError(409, "There is no active browser session.");
      phase = "provider_observe";
      const live = await deps.provider.live(result.providerSession, Boolean(result.humanActor));
      if (!live.live || Date.parse(result.expiresAt ?? "") <= Date.now()) {
        result.state = "session_expired";
        result.humanActor = null;
      } else if (result.humanActor) {
        if (result.humanActor !== actor)
          throw new BrowserError(403, "Another administrator has browser control.");
        if (input.command !== "observe")
          throw new BrowserError(409, "Return human control before running browser actions.");
        // No screenshot, DOM, typed input or trace is captured during human control.
        viewer = live.viewer;
      } else {
        await deps.page(result.providerSession, async (page) => {
          const before = await page.inspect();
          if (input.command === "navigate") {
            if (!input.url) throw new BrowserError(400, "Choose an authorized page.");
            await page.navigate(approvedBrowserUrl(input.url, origins));
            result!.checkpointUrl = input.url;
          } else if (input.command === "scroll") {
            approvedBrowserUrl(before.url, origins);
            if (before.sensitive) throw new BrowserError(409, "This page requires human review.");
            await page.scroll();
          }
          const after = await page.inspect();
          if (after.url !== "about:blank") approvedBrowserUrl(after.url, origins);
          result!.origin = after.url === "about:blank" ? "" : new URL(after.url).origin;
          result!.state = after.sensitive ? "authentication_required" : "ready";
          if (!after.sensitive) screenshot = await page.screenshot();
        });
      }
    }
    phase = "save_result";
    await deps.finish(input.requestId, result, true);
    return json({
      state: result.state,
      expiresAt: result.expiresAt,
      ...(screenshot ? { screenshot } : {}),
      ...(viewer ? { viewer } : {}),
    });
  } catch (error) {
    if (result) {
      // Fail closed: preserve IDs for a verified stop; never invent a successful action.
      result.state = "failed";
      try {
        await deps.finish(input!.requestId, result, false);
      } catch {
        /* lease remains locked until an explicit recovery */
      }
    }
    return json(
      {
        phase,
        error:
          error instanceof BrowserError ||
          error instanceof SteelRequestError ||
          error instanceof SteelProtocolError
            ? error.message
            : "Browser action could not be verified. Stop the session before reconnecting.",
      },
      error instanceof BrowserError ? error.status : 502,
    );
  }
}
