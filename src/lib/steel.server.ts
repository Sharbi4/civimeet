import "@tanstack/react-start/server-only";
import { safeSteelViewer } from "./browser-workspace";

type SteelSession = {
  id: string;
  status: string;
  debugUrl: string;
  profileId?: string;
  createdAt: string;
  timeout?: number;
  debugConfig?: { interactive?: boolean };
};
export class SteelProtocolError extends Error {}
export class SteelRequestError extends Error {
  status: number;
  constructor(status: number) {
    super(
      status === 0
        ? "The server could not connect to Steel. Check the browser service configuration."
        : status === 401 || status === 403
          ? "Steel rejected the browser credentials. Check the server API key and project access."
          : status === 402
            ? "Steel needs available browser credits before this task can run."
            : status === 429
              ? "Steel is at its session limit. Stop an unused session and try again."
              : `Steel could not open the browser (provider status ${status}).`,
    );
    this.status = status;
  }
}
export async function steelRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.steel.dev/v1${path}`, {
      method,
      headers: {
        "steel-api-key": process.env["STEEL_API_KEY"]!.trim(),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
      // Workers supports manual/follow; manual also prevents forwarding the key on redirects.
      redirect: "manual",
    });
  } catch {
    throw new SteelRequestError(0);
  }
  if (!response.ok) throw new SteelRequestError(response.status);
  return response.json();
}
export const steelProvider = {
  async create(id: string, interactive: boolean, profileId: string | null) {
    if (profileId) {
      const profile = await steelRequest<{ status: string }>(`/profiles/${profileId}`);
      if (profile.status !== "READY")
        throw new Error("Browser profile is still saving. Try again shortly.");
    }
    const session = await steelRequest<SteelSession>("/sessions", "POST", {
      sessionId: id,
      timeout: 300_000,
      inactivityTimeout: 120_000,
      persistProfile: true,
      ...(profileId ? { profileId } : {}),
      recordings: false,
      solveCaptcha: false,
      stealthConfig: { autoCaptchaSolving: false },
      debugConfig: { interactive },
      dimensions: { width: 1280, height: 800 },
    });
    if (session.id !== id)
      throw new SteelProtocolError(
        "Steel returned a different session ID. Stop the task before retrying.",
      );
    if (session.status !== "live")
      throw new SteelProtocolError("Steel created the session but did not report it as live.");
    return {
      id: session.id,
      profileId: session.profileId ?? null,
      viewer: interactive ? safeSteelViewer(session.debugUrl) : "",
    };
  },
  async release(id: string) {
    try {
      const current = await steelRequest<SteelSession>(`/sessions/${id}`);
      if (current.status !== "live") return;
    } catch (error) {
      if (error instanceof SteelRequestError && error.status === 404) return;
      throw error;
    }
    await steelRequest(`/sessions/${id}/release`, "POST");
    // Never resume automation while an old interactive session might still accept input.
    const session = await steelRequest<SteelSession>(`/sessions/${id}`);
    if (session.status === "live") throw new Error("Browser is still stopping. Try stop again.");
  },
  async live(id: string, interactive = false) {
    const session = await steelRequest<SteelSession>(`/sessions/${id}`);
    return {
      live: session.status === "live",
      viewer: interactive ? safeSteelViewer(session.debugUrl) : "",
    };
  },
  /** Best effort: a disconnected account's saved browser cookies should not outlive it. */
  async deleteProfile(profileId: string) {
    try {
      await steelRequest(`/profiles/${profileId}`, "DELETE");
    } catch (error) {
      if (error instanceof SteelRequestError && [404, 405].includes(error.status)) return;
      throw error;
    }
  },
};

type CdpResult = {
  targetInfos?: { type: string; targetId: string }[];
  sessionId?: string;
  result?: { value?: unknown };
  exceptionDetails?: unknown;
  errorText?: string;
  data?: string;
};
// Short-lived CDP connections run one bounded operation; no debugging URL reaches the client.
export async function withSteelPage<T>(
  sessionId: string,
  work: (page: SteelPage) => Promise<T>,
  timeoutMs = 25_000,
): Promise<T> {
  const socket = new WebSocket(
    `wss://connect.steel.dev?apiKey=${encodeURIComponent(process.env["STEEL_API_KEY"]!)}&sessionId=${encodeURIComponent(sessionId)}`,
  );
  let sequence = 0;
  const pending = new Map<
    number,
    { resolve: (value: CdpResult) => void; reject: (error: Error) => void }
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
      if (message.error) item.reject(new Error("Browser action could not be completed."));
      else item.resolve(message.result);
    } catch {
      fail();
    }
  });
  socket.addEventListener("close", fail);
  socket.addEventListener("error", fail);
  function send(
    method: string,
    params: Record<string, unknown> = {},
    attached?: string,
  ): Promise<CdpResult> {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({ id, method, params, ...(attached ? { sessionId: attached } : {}) }),
      );
    });
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Browser connection timed out.")), 10_000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("Browser connection failed."));
        },
        { once: true },
      );
    });
    const targets = await send("Target.getTargets");
    const target = targets.targetInfos?.find((item) => item.type === "page");
    if (!target) throw new Error("No browser page is available.");
    const attached = await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    if (!attached.sessionId) throw new Error("Could not attach to the browser page.");
    const page = new SteelPage((method, params) => send(method, params, attached.sessionId));
    return await work(page);
  } finally {
    clearTimeout(deadline);
    fail();
    socket.close();
  }
}
export class SteelPage {
  private send: (method: string, params?: Record<string, unknown>) => Promise<CdpResult>;
  constructor(send: (method: string, params?: Record<string, unknown>) => Promise<CdpResult>) {
    this.send = send;
  }
  async inspect(): Promise<{ url: string; sensitive: boolean }> {
    const result = await this.send("Runtime.evaluate", {
      expression: `JSON.stringify({url:location.href,sensitive:!!document.querySelector('input,textarea,[contenteditable="true"],iframe')||/login|signin|sign-in|oauth|verify|captcha|challenge|checkout|payment/i.test(location.href)})`,
      returnByValue: true,
    });
    if (result.exceptionDetails || typeof result.result?.value !== "string")
      throw new Error("Could not inspect browser safety state.");
    return JSON.parse(result.result.value);
  }
  async navigate(url: string) {
    const result = await this.send("Page.navigate", { url });
    if (result.errorText) throw new Error("Page navigation failed.");
    // Poll real document state rather than claiming a successful navigation on dispatch.
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const state = await this.send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if (state.result?.value === "complete") return;
    }
    throw new Error("Page is still loading. Inspect it before another action.");
  }
  async scroll() {
    await this.send("Input.synthesizeScrollGesture", {
      x: 600,
      y: 450,
      yDistance: -500,
      speed: 600,
    });
  }
  private async evaluate(expression: string): Promise<unknown> {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Browser page check failed.");
    return result.result?.value;
  }
  // Selectors are fixed strings from CiviMeet's sign-in playbooks, never user input.
  // The lookup also searches open shadow roots (Reddit and others render forms there).
  private find(selectors: string, then: string) {
    return `(() => { const stack = [document]; while (stack.length) { const root = stack.shift(); const el = root.querySelector(${JSON.stringify(selectors)}); if (el) { ${then} } for (const node of root.querySelectorAll("*")) if (node.shadowRoot) stack.push(node.shadowRoot); } return false; })()`;
  }
  async exists(selectors: string) {
    return (await this.evaluate(this.find(selectors, "return true;"))) === true;
  }
  async waitFor(selectors: string, timeoutMs = 8_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await this.exists(selectors)) return true;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return false;
  }
  /** Focus a field and type into it. The value travels as keystrokes, never inside a script. */
  async fill(selectors: string, value: string) {
    const focused = await this.evaluate(
      this.find(
        selectors,
        "el.focus(); if (typeof el.select === 'function') el.select(); return true;",
      ),
    );
    if (focused !== true) return false;
    await this.send("Input.insertText", { text: value });
    return true;
  }
  async click(selectors: string) {
    return (await this.evaluate(this.find(selectors, "el.click(); return true;"))) === true;
  }
  async pressEnter() {
    const key = {
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...key });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  }
  /** Where the page is and whether a password field is still showing. No content is read. */
  async signInState(
    challengeSelectors = "",
  ): Promise<{ url: string; passwordField: boolean; challenge: boolean }> {
    const url = await this.evaluate("location.href");
    const passwordField = await this.exists('input[type="password"]');
    const challenge = challengeSelectors ? await this.exists(challengeSelectors) : false;
    if (typeof url !== "string") throw new Error("Could not read the browser location.");
    return { url, passwordField, challenge };
  }
  async screenshot(): Promise<string> {
    const result = await this.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 65,
      captureBeyondViewport: false,
    });
    if (typeof result.data !== "string" || result.data.length > 3_000_000)
      throw new Error("Browser image unavailable.");
    return `data:image/jpeg;base64,${result.data}`;
  }
}
