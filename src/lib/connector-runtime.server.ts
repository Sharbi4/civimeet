import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import {
  connectorCommandSchema,
  connectors,
  getConnector,
  maskIdentifier,
  oauthEnvNames,
  type ConnectorCommand,
  type ConnectorStatus,
  type OAuthProvider,
} from "./connectors";
import {
  openConnectorSecret,
  pkceChallenge,
  randomToken,
  sealConnectorSecret,
} from "./connector-crypto.server";
import {
  classifySignIn,
  loginPlaybooks,
  signInWithSavedLogin,
  type LoginSecret,
  type SignInOutcome,
} from "./connector-login.server";
import {
  exchangeOAuthCode,
  oauthAuthorizeUrl,
  oauthConfigured,
  oauthProviders,
  type OAuthTokens,
} from "./connector-oauth.server";
import {
  SteelProtocolError,
  SteelRequestError,
  steelProvider,
  withSteelPage,
  type SteelPage,
} from "./steel.server";

type Claim = {
  status: ConnectorStatus;
  method: string;
  connectedAt: string | null;
  profileId: string | null;
  providerSession: string | null;
  humanActor: string | null;
  expiresAt: string | null;
  hasSecret: boolean;
};
type Finish = {
  status?: ConnectorStatus;
  method?: "browser" | "credentials" | "oauth";
  accountLabel?: string;
  detail?: string;
  checked?: true;
  profileId?: string;
  providerSession?: string;
  humanActor?: string;
  expiresAt?: string;
  keepLease?: boolean;
  event?: string;
  message?: string;
};
export class ConnectorError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
const SIGN_IN_WINDOW_MS = 300_000;

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
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await database().rpc(name, args);
  if (error) {
    const known = /Administrator access required|busy|allowance|expired|Start again/i.exec(
      error.message,
    );
    throw new ConnectorError(
      known ? (/Administrator/.test(error.message) ? 403 : 409) : 500,
      known ? error.message : "Connector state could not be saved.",
    );
  }
  return data as T;
}

const defaults = {
  env: process.env as Record<string, string | undefined>,
  async authorize(token: string, organizationId: string) {
    const db = database();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ConnectorError(401, "Sign in to manage connections.");
    const member = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (member.error || !member.data || !["owner", "admin"].includes(member.data.role))
      throw new ConnectorError(
        403,
        "Only an organization owner or administrator can manage connections.",
      );
    return data.user.id;
  },
  claim: (
    actor: string,
    organizationId: string,
    connector: string,
    operation: string,
    lease = 90,
  ) =>
    rpc<Claim>("claim_connector_operation", {
      actor,
      workspace: organizationId,
      target: connector,
      operation,
      lease_seconds: lease,
    }),
  finish: (organizationId: string, connector: string, actor: string, result: Finish) =>
    rpc<void>("finish_connector_operation", {
      workspace: organizationId,
      target: connector,
      actor,
      result,
    }),
  storeSecret: (organizationId: string, connector: string, sealed: string) =>
    rpc<void>("store_connector_secret", { workspace: organizationId, target: connector, sealed }),
  readSecret: (organizationId: string, connector: string) =>
    rpc<string | null>("read_connector_secret", { workspace: organizationId, target: connector }),
  forget: (organizationId: string, connector: string) =>
    rpc<string | null>("forget_connector", { workspace: organizationId, target: connector }),
  beginOAuth: (
    actor: string,
    organizationId: string,
    connector: string,
    state: string,
    verifier: string,
    callback: string,
  ) =>
    rpc<void>("begin_connector_oauth", {
      actor,
      workspace: organizationId,
      target: connector,
      oauth_state: state,
      verifier,
      callback,
    }),
  takeOAuth: (state: string) =>
    rpc<{
      organizationId: string;
      connector: string;
      actor: string;
      verifier: string;
      redirectUri: string;
    }>("take_connector_oauth", { oauth_state: state }),
  provider: steelProvider,
  page: withSteelPage as <T>(
    sessionId: string,
    work: (page: SteelPage) => Promise<T>,
    timeoutMs?: number,
  ) => Promise<T>,
  fetch: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch,
  newSessionId: () => crypto.randomUUID(),
};
export type ConnectorDeps = typeof defaults;
const browserReady = (env: Record<string, string | undefined>) =>
  Boolean(env["STEEL_API_KEY"] && env["SUPABASE_SERVICE_ROLE_KEY"] && env["SUPABASE_URL"]);

/** Public capability status: which sign-in paths this deployment has configured. No secrets. */
export function connectorRuntimeStatus(env: Record<string, string | undefined> = process.env) {
  const providers = new Set(
    connectors.flatMap((connector) => (connector.oauth ? [connector.oauth.provider] : [])),
  );
  return json({
    browser: browserReady(env),
    oauth: Object.fromEntries(
      [...providers].map((provider) => [provider, oauthConfigured(provider, env)]),
    ),
  });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ConnectorError(400, "Provide a connector command.");
  const decoder = new TextDecoder();
  let text = "";
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 8192) {
        await reader.cancel();
        throw new ConnectorError(413, "Connector request is too large.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ConnectorError(400, "Send valid JSON.");
  }
}

export async function handleConnectorCommand(
  request: Request,
  overrides: Partial<ConnectorDeps> = {},
) {
  const deps = { ...defaults, ...overrides };
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site requests are not allowed." }, 403);
  const token = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!token) return json({ error: "Sign in to manage connections." }, 401);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "Send JSON." }, 415);
  try {
    const parsed = connectorCommandSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new ConnectorError(400, "Invalid connector request.");
    const input = parsed.data;
    const actor = await deps.authorize(token, input.organizationId);
    return json(await run(deps, actor, input, new URL(request.url).origin));
  } catch (error) {
    const message =
      error instanceof ConnectorError ||
      error instanceof SteelRequestError ||
      error instanceof SteelProtocolError
        ? error.message
        : "The connection could not be completed. Try again.";
    return json({ error: message }, error instanceof ConnectorError ? error.status : 502);
  }
}

async function run(deps: ConnectorDeps, actor: string, input: ConnectorCommand, origin: string) {
  const definition = getConnector(input.connector)!;
  const org = input.organizationId;
  const id = input.connector;
  const finish = (result: Finish) => deps.finish(org, id, actor, result);
  const needBrowser = () => {
    if (!browserReady(deps.env))
      throw new ConnectorError(
        409,
        "The agent browser is not configured on this deployment yet (Steel API key).",
      );
  };

  if (input.command === "oauth_start") {
    if (!definition.oauth)
      throw new ConnectorError(400, `${definition.name} does not offer an official sign-in.`);
    const provider = definition.oauth.provider;
    if (!oauthConfigured(provider, deps.env))
      throw new ConnectorError(409, oauthSetupMessage(provider));
    const state = randomToken(32);
    const verifier = randomToken(48);
    const redirectUri = `${origin}/api/connectors/oauth/callback`;
    await deps.beginOAuth(actor, org, id, state, verifier, redirectUri);
    await finish({
      keepLease: true,
      event: "oauth_started",
      message: `Opened ${definition.oauth.label.replace("Continue with ", "")} sign-in`,
    });
    return {
      redirect: oauthAuthorizeUrl(
        provider,
        { state, redirectUri, challenge: await pkceChallenge(verifier) },
        deps.env,
      ),
    };
  }

  if (input.command === "browser_observe") {
    const claim = await deps.claim(actor, org, id, "browser_observe");
    if (!claim.providerSession) return { status: claim.status };
    if (claim.humanActor && claim.humanActor !== actor)
      throw new ConnectorError(
        403,
        "Another administrator is signing in to this account right now.",
      );
    const live = await deps.provider.live(claim.providerSession, true);
    if (!live.live || Date.parse(claim.expiresAt ?? "") <= Date.now()) {
      const status = fallbackStatus(claim);
      await finish({
        status,
        providerSession: "",
        humanActor: "",
        expiresAt: "",
        keepLease: true,
        detail: "The sign-in window closed. Start again when you are ready.",
        event: "browser_sign_in_cancelled",
        message: "Sign-in window timed out",
      });
      return { status };
    }
    return { status: claim.status, viewer: live.viewer, expiresAt: claim.expiresAt };
  }

  if (input.command === "browser_start") {
    if (!definition.methods.includes("browser") || !definition.loginUrl)
      throw new ConnectorError(400, `${definition.name} does not support live sign-in.`);
    needBrowser();
    const claim = await deps.claim(actor, org, id, "browser_start", 60);
    try {
      if (claim.providerSession) await deps.provider.release(claim.providerSession);
      const created = await deps.provider.create(deps.newSessionId(), true, claim.profileId);
      const expiresAt = new Date(Date.now() + SIGN_IN_WINDOW_MS).toISOString();
      await deps.page(created.id, async (page) => {
        try {
          await page.navigate(definition.loginUrl!);
        } catch {
          // The person can still use the page while it finishes loading.
        }
      });
      await finish({
        status: "awaiting_sign_in",
        method: "browser",
        profileId: created.profileId ?? "",
        providerSession: created.id,
        humanActor: actor,
        expiresAt,
        detail: `Sign in to ${definition.name} in the agent browser.`,
        event: "browser_sign_in_started",
        message: "Opened the agent browser for sign-in",
      });
      return { status: "awaiting_sign_in", viewer: created.viewer, expiresAt };
    } catch (error) {
      await finish({
        status: fallbackStatus(claim),
        detail: "The agent browser could not open. Try again.",
      }).catch(() => {});
      throw error;
    }
  }

  if (input.command === "browser_finish") {
    const claim = await deps.claim(actor, org, id, "browser_finish", 45);
    if (!claim.providerSession) {
      await finish({});
      throw new ConnectorError(409, "There is no open sign-in. Start again.");
    }
    if (claim.humanActor && claim.humanActor !== actor) {
      await finish({});
      throw new ConnectorError(403, "Another administrator is signing in to this account.");
    }
    const playbook = loginPlaybooks[id] ?? genericPlaybook;
    const outcome = await deps.page(claim.providerSession, (page) =>
      classifySignIn(page, playbook),
    );
    if (outcome.kind !== "signed_in") {
      const message =
        outcome.kind === "challenge"
          ? `Finish ${definition.name}’s security check in the browser, then tap “I’m signed in”.`
          : `${definition.name} still shows its sign-in page. Finish signing in, then tap “I’m signed in”.`;
      await finish({ detail: message });
      return { status: claim.status, message };
    }
    // Releasing the session saves the signed-in browser profile for the agent.
    await deps.provider.release(claim.providerSession);
    await finish({
      status: "connected",
      method: claim.hasSecret ? "credentials" : "browser",
      ...(claim.hasSecret ? {} : { accountLabel: "Signed in through the agent browser" }),
      checked: true,
      providerSession: "",
      humanActor: "",
      expiresAt: "",
      detail: "",
      event: "browser_sign_in_finished",
      message: `Signed in to ${definition.name}`,
    });
    return { status: "connected" };
  }

  if (input.command === "browser_cancel") {
    const claim = await deps.claim(actor, org, id, "browser_cancel", 30);
    if (claim.providerSession) await deps.provider.release(claim.providerSession);
    const status = fallbackStatus(claim);
    await finish({
      status,
      providerSession: "",
      humanActor: "",
      expiresAt: "",
      detail: "",
      event: "browser_sign_in_cancelled",
      message: "Closed the agent browser",
    });
    return { status };
  }

  if (input.command === "save_credentials") {
    if (!definition.methods.includes("credentials") || !definition.fields)
      throw new ConnectorError(400, `${definition.name} does not support saved logins.`);
    const claim = await deps.claim(actor, org, id, "save_credentials", 120);
    const secret: LoginSecret = {
      identifier: input.credentials.identifier,
      password: input.credentials.password,
      ...(input.credentials.handle ? { handle: input.credentials.handle.replace(/^@/, "") } : {}),
    };
    try {
      await deps.storeSecret(
        org,
        id,
        await sealConnectorSecret(
          { kind: "login", ...secret },
          { organizationId: org, connector: id },
          deps.env,
        ),
      );
    } catch (error) {
      await finish({});
      throw error instanceof ConnectorError
        ? error
        : new ConnectorError(500, "The login could not be stored securely.");
    }
    const label = maskIdentifier(secret.identifier);
    const playbook = loginPlaybooks[id];
    if (!browserReady(deps.env) || !playbook) {
      await finish({
        status: "saved",
        method: "credentials",
        accountLabel: label,
        detail: `Login saved. Open the live browser once to finish the first ${definition.name} sign-in.`,
        event: "credentials_saved",
        message: "Saved an encrypted login",
      });
      return { status: "saved" };
    }
    await finish({
      status: "verifying",
      method: "credentials",
      accountLabel: label,
      keepLease: true,
      event: "credentials_saved",
      message: "Saved an encrypted login",
    });
    return verifySavedLogin(deps, actor, org, id, claim, secret, label);
  }

  if (input.command === "verify") {
    const claim = await deps.claim(actor, org, id, "verify", 120);
    if (claim.method === "oauth") return verifyOAuth(deps, actor, org, id, claim);
    if (claim.hasSecret && loginPlaybooks[id] && browserReady(deps.env)) {
      const sealed = await deps.readSecret(org, id);
      const secret = await openConnectorSecret<LoginSecret & { kind: string }>(
        sealed!,
        { organizationId: org, connector: id },
        deps.env,
      );
      return verifySavedLogin(
        deps,
        actor,
        org,
        id,
        claim,
        secret,
        maskIdentifier(secret.identifier),
      );
    }
    if (!claim.profileId || !browserReady(deps.env)) {
      await finish({});
      throw new ConnectorError(
        409,
        claim.profileId
          ? "The agent browser is not configured on this deployment yet (Steel API key)."
          : "Sign in first, then the agent can check the connection.",
      );
    }
    const created = await deps.provider.create(deps.newSessionId(), false, claim.profileId);
    try {
      const outcome = await deps.page(created.id, async (page) => {
        try {
          await page.navigate(definition.loginUrl!);
        } catch {
          /* classified below */
        }
        return classifySignIn(page, loginPlaybooks[id] ?? genericPlaybook);
      });
      const connected = outcome.kind === "signed_in";
      await finish({
        status: connected ? "connected" : "needs_attention",
        checked: true,
        detail: connected ? "" : `${definition.name} signed the agent out. Sign in again.`,
        event: connected ? "verified" : "verification_failed",
        message: connected ? "Agent confirmed it is still signed in" : "The agent was signed out",
      });
      return { status: connected ? "connected" : "needs_attention" };
    } finally {
      await deps.provider.release(created.id).catch(() => {});
    }
  }

  // disconnect
  const claim = await deps.claim(actor, org, id, "disconnect", 60);
  if (claim.providerSession) await deps.provider.release(claim.providerSession).catch(() => {});
  const profile = await deps.forget(org, id);
  if (profile) await deps.provider.deleteProfile(profile).catch(() => {});
  await finish({
    status: "not_connected",
    accountLabel: "",
    detail: "",
    profileId: "",
    providerSession: "",
    humanActor: "",
    expiresAt: "",
    event: "disconnected",
    message: "Disconnected and removed the saved login and browser profile",
  });
  return { status: "not_connected" };
}

const genericPlaybook = {
  challengeUrl: /\/(checkpoint|challenge|two[-_]?factor|verify|captcha)/i,
  loginUrl: /\/(login|signin|sign-in|accounts\/login)/i,
};
function fallbackStatus(claim: Claim): ConnectorStatus {
  if (claim.connectedAt) return "connected";
  return claim.hasSecret ? "saved" : "not_connected";
}

async function verifySavedLogin(
  deps: ConnectorDeps,
  actor: string,
  org: string,
  id: string,
  claim: Claim,
  secret: LoginSecret,
  label: string,
) {
  const definition = getConnector(id)!;
  const finish = (result: Finish) => deps.finish(org, id, actor, result);
  if (claim.providerSession) await deps.provider.release(claim.providerSession).catch(() => {});
  // Interactive, so a security check can be handed to the person without starting over.
  let created: Awaited<ReturnType<ConnectorDeps["provider"]["create"]>>;
  try {
    created = await deps.provider.create(deps.newSessionId(), true, claim.profileId);
  } catch (error) {
    const detail =
      error instanceof SteelRequestError ||
      error instanceof SteelProtocolError ||
      error instanceof Error
        ? `Login saved, but the agent browser could not open: ${error.message}`
        : "Login saved, but the agent browser could not open.";
    await finish({
      status: "saved",
      method: "credentials",
      accountLabel: label,
      detail: detail.slice(0, 480),
    });
    return { status: "saved", message: detail };
  }
  let outcome: SignInOutcome;
  try {
    outcome = await deps.page(
      created.id,
      (page) => signInWithSavedLogin(page, definition.loginUrl!, loginPlaybooks[id]!, secret),
      45_000,
    );
  } catch {
    outcome = {
      kind: "page_changed",
      message: `The agent could not finish signing in to ${definition.name}. Use the live browser.`,
    };
  }
  if (outcome.kind === "signed_in") {
    await deps.provider.release(created.id);
    await finish({
      status: "connected",
      method: "credentials",
      accountLabel: label,
      checked: true,
      profileId: created.profileId ?? "",
      providerSession: "",
      humanActor: "",
      expiresAt: "",
      detail: "",
      event: "verified",
      message: `Agent signed in to ${definition.name}`,
    });
    return { status: "connected" };
  }
  if (outcome.kind === "still_signing_in") {
    await deps.provider.release(created.id).catch(() => {});
    const detail = `${definition.name} did not accept that login. Check the details and save again.`;
    await finish({
      status: "needs_attention",
      method: "credentials",
      checked: true,
      profileId: created.profileId ?? "",
      providerSession: "",
      humanActor: "",
      expiresAt: "",
      detail,
      event: "verification_failed",
      message: "Login was not accepted",
    });
    return { status: "needs_attention", message: detail };
  }
  // A security check or a changed page: keep the browser open for the person to finish.
  const expiresAt = new Date(Date.now() + SIGN_IN_WINDOW_MS).toISOString();
  const detail =
    outcome.kind === "challenge"
      ? `${definition.name} wants to confirm it’s you. Finish the check in the live browser.`
      : outcome.message;
  await finish({
    status: "needs_verification",
    method: "credentials",
    profileId: created.profileId ?? "",
    providerSession: created.id,
    humanActor: actor,
    expiresAt,
    detail,
    event: "verification_needed",
    message: outcome.kind === "challenge" ? "Security check needed" : "Sign-in page changed",
  });
  return { status: "needs_verification", viewer: created.viewer, expiresAt, message: detail };
}

async function verifyOAuth(
  deps: ConnectorDeps,
  actor: string,
  org: string,
  id: string,
  claim: Claim,
) {
  const definition = getConnector(id)!;
  const provider = definition.oauth?.provider;
  const sealed = claim.hasSecret ? await deps.readSecret(org, id) : null;
  if (!provider || !sealed || !oauthConfigured(provider, deps.env)) {
    await deps.finish(org, id, actor, {
      status: "needs_attention",
      checked: true,
      detail: "Sign in again to reconnect.",
      event: "verification_failed",
      message: "Official connection missing",
    });
    return { status: "needs_attention" };
  }
  const tokens = await openConnectorSecret<OAuthTokens>(
    sealed,
    { organizationId: org, connector: id },
    deps.env,
  );
  const expired = tokens.expires_at ? Date.parse(tokens.expires_at) <= Date.now() : false;
  let ok = !expired;
  let label = "";
  if (ok) {
    try {
      label = await oauthProviders[provider].account(tokens.access_token, deps.env, deps.fetch);
    } catch {
      ok = false;
    }
  }
  await deps.finish(org, id, actor, {
    status: ok ? "connected" : "needs_attention",
    checked: true,
    ...(label ? { accountLabel: label } : {}),
    detail: ok ? "" : `${definition.name} access expired. Sign in again.`,
    event: ok ? "verified" : "verification_failed",
    message: ok ? "Official connection confirmed" : "Official connection expired",
  });
  return { status: ok ? "connected" : "needs_attention" };
}

function oauthSetupMessage(provider: OAuthProvider) {
  return `This sign-in needs an app registered with the platform. Add ${oauthEnvNames[provider]} to the server secrets.`;
}

/** OAuth return: exchange the code, seal the tokens and send the person back to Connectors. */
export async function handleConnectorOAuthCallback(
  request: Request,
  overrides: Partial<ConnectorDeps> = {},
) {
  const deps = { ...defaults, ...overrides };
  const url = new URL(request.url);
  const back = (connector: string, result: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/dashboard?view=connectors&connector=${encodeURIComponent(connector)}&result=${encodeURIComponent(result)}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  const state = url.searchParams.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return back("", "expired");
  let taken: Awaited<ReturnType<ConnectorDeps["takeOAuth"]>>;
  try {
    taken = await deps.takeOAuth(state);
  } catch {
    return back("", "expired");
  }
  const { organizationId: org, connector: id, actor } = taken;
  const definition = getConnector(id);
  const provider = definition?.oauth?.provider;
  const code = url.searchParams.get("code");
  const finish = (result: Finish) => deps.finish(org, id, actor, { keepLease: true, ...result });
  if (!definition || !provider || !code || url.searchParams.get("error")) {
    await finish({
      status: "needs_attention",
      detail: "The sign-in was cancelled or declined.",
      event: "oauth_failed",
      message: "Official sign-in cancelled",
    }).catch(() => {});
    return back(id, "cancelled");
  }
  try {
    const { tokens, account } = await exchangeOAuthCode(
      provider,
      { code, redirectUri: taken.redirectUri, verifier: taken.verifier },
      deps.env,
      deps.fetch,
    );
    await deps.storeSecret(
      org,
      id,
      await sealConnectorSecret(tokens, { organizationId: org, connector: id }, deps.env),
    );
    await finish({
      status: "connected",
      method: "oauth",
      accountLabel: account,
      checked: true,
      detail: "",
      event: "oauth_connected",
      message: `Connected ${account}`,
    });
    return back(id, "connected");
  } catch {
    await finish({
      status: "needs_attention",
      detail: "The platform did not finish the sign-in. Try again.",
      event: "oauth_failed",
      message: "Official sign-in failed",
    }).catch(() => {});
    return back(id, "failed");
  }
}
