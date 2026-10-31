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
class SteelRequestError extends Error {
  status: number;
  constructor(status: number) {
    super("Browser provider request failed.");
    this.status = status;
  }
}
export async function steelRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`https://api.steel.dev/v1${path}`, {
    method,
    headers: { "steel-api-key": process.env["STEEL_API_KEY"]!, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
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
    if (session.id !== id || session.status !== "live")
      throw new Error("Browser did not become ready.");
    return {
      id: session.id,
      profileId: session.profileId ?? null,
      viewer: safeSteelViewer(session.debugUrl),
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
  async live(id: string) {
    const session = await steelRequest<SteelSession>(`/sessions/${id}`);
    return { live: session.status === "live", viewer: safeSteelViewer(session.debugUrl) };
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
  }, 25_000);
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
