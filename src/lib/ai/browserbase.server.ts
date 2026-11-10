import "@tanstack/react-start/server-only";

// Civi's live browser runs on Browserbase. CiviMeet owns each browser session: it creates it,
// hands the team a live-view link they can watch or take over, and drives it only through
// Civi's browser tools, each checked against CiviMeet's rules before it runs. The API key and
// the CDP connect URL never leave the server.
const API = "https://api.browserbase.com/v1";

export class BrowserbaseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function browserbaseConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env["BROWSERBASE_API_KEY"]?.trim());
}
async function request<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const key = process.env["BROWSERBASE_API_KEY"]?.trim();
  if (!key) throw new BrowserbaseError(503, "Civi's browser needs BROWSERBASE_API_KEY.");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: { "X-BB-API-Key": key, "Content-Type": "application/json" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(20_000),
      redirect: "manual",
    });
  } catch {
    throw new BrowserbaseError(503, "Civi couldn't reach Browserbase. Try again in a moment.");
  }
  const text = await response.text();
  if (!response.ok) {
    // Browserbase's message helps explain plan limits; it never contains the API key.
    const detail = (() => {
      try {
        const body = JSON.parse(text) as { message?: string; error?: string };
        return String(body.message ?? body.error ?? "").slice(0, 200);
      } catch {
        return "";
      }
    })();
    throw new BrowserbaseError(
      response.status,
      response.status === 401 || response.status === 403
        ? "Browserbase rejected the API key. Check BROWSERBASE_API_KEY."
        : response.status === 402 || response.status === 429
          ? `Browserbase can't start another browser right now${detail ? `: ${detail}` : "."}`
          : `Browserbase returned ${response.status}${detail ? `: ${detail}` : "."}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type BrowserSession = { id: string; connectUrl: string; liveUrl: string; expiresAt: string };
const TIMEOUT_SECONDS = 1800;

/** Open a new browser: 30 minutes, kept alive between Civi's steps, nothing recorded. */
export async function openBrowser(metadata: Record<string, string>): Promise<BrowserSession> {
  const body = (keepAlive: boolean) => ({
    ...(process.env["BROWSERBASE_PROJECT_ID"]?.trim()
      ? { projectId: process.env["BROWSERBASE_PROJECT_ID"]!.trim() }
      : {}),
    timeout: TIMEOUT_SECONDS,
    ...(keepAlive ? { keepAlive: true } : {}),
    userMetadata: metadata,
    browserSettings: {
      viewport: { width: 1280, height: 800 },
      blockAds: true,
      solveCaptchas: false,
      recordSession: false,
      logSession: false,
    },
  });
  type Created = { id: string; connectUrl: string; expiresAt?: string };
  let created: Created;
  try {
    created = await request<Created>("/sessions", { method: "POST", body: body(true) });
  } catch (error) {
    // keepAlive needs a paid Browserbase plan; without it the browser still works per step.
    if (!(error instanceof BrowserbaseError) || ![400, 402, 403, 422].includes(error.status))
      throw error;
    created = await request<Created>("/sessions", { method: "POST", body: body(false) });
  }
  if (!created.id || !created.connectUrl?.startsWith("wss://"))
    throw new BrowserbaseError(502, "Browserbase didn't return a usable browser.");
  const live = await request<{ debuggerFullscreenUrl: string }>(
    `/sessions/${encodeURIComponent(created.id)}/debug`,
  );
  return {
    id: created.id,
    connectUrl: created.connectUrl,
    liveUrl: safeLiveUrl(live.debuggerFullscreenUrl),
    expiresAt: created.expiresAt ?? new Date(Date.now() + TIMEOUT_SECONDS * 1000).toISOString(),
  };
}
/** Only Browserbase's own https live-view pages are ever framed in the dashboard. */
export function safeLiveUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !/(^|\.)browserbase\.com$/i.test(url.hostname))
    throw new BrowserbaseError(502, "Browserbase returned an unexpected live-view address.");
  url.searchParams.set("navbar", "false");
  return url.href;
}
export async function browserRunning(id: string) {
  try {
    const session = await request<{ status?: string }>(`/sessions/${encodeURIComponent(id)}`);
    return session.status === "RUNNING" || session.status === "PENDING";
  } catch (error) {
    if (error instanceof BrowserbaseError && error.status === 404) return false;
    throw error;
  }
}
export async function closeBrowser(id: string) {
  await request(`/sessions/${encodeURIComponent(id)}`, {
    method: "POST",
    body: { status: "REQUEST_RELEASE" },
  }).catch(() => {});
}

type CdpResult = {
  targetInfos?: { type: string; targetId: string; url?: string }[];
  sessionId?: string;
  result?: { value?: unknown };
  exceptionDetails?: unknown;
  errorText?: string;
};
export type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResult>;

/** One short CDP connection to the browser's current tab for a single bounded step. */
export async function withBrowserTab<T>(
  connectUrl: string,
  work: (send: CdpSend) => Promise<T>,
  timeoutMs = 30_000,
): Promise<T> {
  const socket = new WebSocket(connectUrl);
  let sequence = 0;
  const pending = new Map<
    number,
    { resolve: (v: CdpResult) => void; reject: (e: Error) => void }
  >();
  const fail = () => {
    for (const item of pending.values()) item.reject(new Error("Browser connection ended."));
    pending.clear();
  };
  const deadline = setTimeout(() => {
    fail();
    socket.close();
  }, timeoutMs);
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error("The browser couldn't do that step."));
      else item.resolve(message.result);
    } catch {
      fail();
    }
  });
  socket.addEventListener("close", fail);
  socket.addEventListener("error", fail);
  const raw = (method: string, params: Record<string, unknown> = {}, attached?: string) =>
    new Promise<CdpResult>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({ id, method, params, ...(attached ? { sessionId: attached } : {}) }),
      );
    });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Browser connection timed out.")), 10_000);
      socket.addEventListener("open", () => (clearTimeout(timer), resolve()), { once: true });
      socket.addEventListener(
        "error",
        () => (clearTimeout(timer), reject(new Error("Couldn't connect to the browser."))),
        { once: true },
      );
    });
    // The tab the team sees in the live view is the browser's first page.
    const targets = await raw("Target.getTargets");
    const target = targets.targetInfos?.find((item) => item.type === "page");
    if (!target) throw new Error("The browser has no open tab.");
    const attached = await raw("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    if (!attached.sessionId) throw new Error("Couldn't attach to the browser tab.");
    const sessionId = attached.sessionId;
    return await work((method, params) => raw(method, params, sessionId));
  } finally {
    clearTimeout(deadline);
    fail();
    socket.close();
  }
}
