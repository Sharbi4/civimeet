// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { handleBrowserCommand } from "@/lib/browser-runtime.server";
import { approvedBrowserUrl, safeSteelViewer } from "@/lib/browser-workspace";
import { steelProvider, type SteelPage } from "@/lib/steel.server";
const org = "11111111-1111-4111-8111-111111111111";
const agent = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const input = {
  organizationId: org,
  agentId: agent,
  requestId,
  command: "start",
  url: "https://example.com/",
  task: "Review community resources",
};
function request(body: unknown = input, extra: Record<string, string> = {}) {
  return new Request("https://civimeet.com/api/browser/command", {
    method: "POST",
    headers: { Authorization: "Bearer session", "Content-Type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
}
function dependencies() {
  const page = {
    navigate: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ url: "https://example.com/", sensitive: false }),
    scroll: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue("data:image/jpeg;base64,actual-test-capture"),
  };
  return {
    authorize: vi.fn().mockResolvedValue("admin-a"),
    origins: async () => ["https://example.com"],
    handoff: () => true,
    claim: vi.fn().mockResolvedValue({
      workspace: {
        state: "not_connected",
        current_origin: "",
        task: "",
        human_actor: null,
        expires_at: null,
      },
      runtime: {
        provider_session: null,
        profile_id: null,
        checkpoint_url: "",
        operation_id: null,
      },
    }),
    finish: vi.fn().mockResolvedValue(undefined),
    provider: {
      create: vi.fn().mockResolvedValue({
        id: requestId,
        profileId: "profile",
        viewer: "https://api.steel.dev/v1/sessions/33333333-3333-4333-8333-333333333333/player",
      }),
      release: vi.fn().mockResolvedValue(undefined),
      live: vi.fn().mockResolvedValue({
        live: true,
        viewer: "https://api.steel.dev/v1/sessions/33333333-3333-4333-8333-333333333333/player",
      }),
    },
    page: async <T>(_id: string, work: (value: SteelPage) => Promise<T>) =>
      work(page as unknown as SteelPage),
    pageMock: page,
  };
}
beforeEach(() => vi.unstubAllGlobals());
describe("browser command boundaries", () => {
  it("rejects cross-site calls before claiming or provisioning", async () => {
    const deps = dependencies();
    expect(
      (await handleBrowserCommand(request(input, { Origin: "https://evil.invalid" }), deps)).status,
    ).toBe(403);
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated calls", async () => {
    const deps = dependencies();
    expect((await handleBrowserCommand(request(input, { Authorization: "" }), deps)).status).toBe(
      401,
    );
    expect(deps.provider.create).not.toHaveBeenCalled();
  });
  it("checks organization membership before external work", async () => {
    const deps = dependencies();
    deps.authorize.mockRejectedValue(new Error("forbidden"));
    await handleBrowserCommand(request(), deps);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.provider.create).not.toHaveBeenCalled();
  });
  it("never navigates outside the tenant allowlist", async () => {
    const deps = dependencies();
    const response = await handleBrowserCommand(
      request({ ...input, url: "https://facebook.com" }),
      deps,
    );
    expect(response.ok).toBe(false);
    expect(deps.provider.create).not.toHaveBeenCalled();
  });
  it("creates a real provider session with a stable recovery ID and no viewer exposure", async () => {
    const deps = dependencies();
    const response = await handleBrowserCommand(request(), deps);
    expect(response.status).toBe(200);
    expect(deps.provider.create).toHaveBeenCalledWith(requestId, false, null);
    expect(deps.pageMock.navigate).toHaveBeenCalledWith("https://example.com/");
    expect(await response.json()).not.toHaveProperty("viewer");
    expect(deps.finish).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({ providerSession: requestId, state: "ready" }),
      true,
    );
  });
  it("hides authentication pages rather than capturing credentials", async () => {
    const deps = dependencies();
    deps.pageMock.inspect.mockResolvedValue({ url: "https://example.com/login", sensitive: true });
    const response = await handleBrowserCommand(request(), deps);
    expect((await response.json()).state).toBe("authentication_required");
    expect(deps.pageMock.screenshot).not.toHaveBeenCalled();
  });
  it("does not resume while an interactive provider session may still be live", async () => {
    const deps = dependencies();
    deps.claim.mockResolvedValue({
      workspace: {
        state: "human_controlling",
        current_origin: "https://example.com",
        task: "Task checkpoint",
        human_actor: "admin-a",
        expires_at: new Date(Date.now() + 300000).toISOString(),
      },
      runtime: {
        provider_session: "old-session",
        profile_id: "profile",
        checkpoint_url: "https://example.com/",
        operation_id: null,
      },
    });
    deps.provider.release.mockRejectedValue(new Error("still live"));
    const response = await handleBrowserCommand(request({ ...input, command: "resume" }), deps);
    expect(response.ok).toBe(false);
    expect(deps.provider.create).not.toHaveBeenCalled();
  });
  it("prevents browser actions while a human owns control even after a failure", async () => {
    const deps = dependencies();
    deps.claim.mockResolvedValue({
      workspace: {
        state: "failed",
        current_origin: "https://example.com",
        task: "",
        human_actor: "admin-a",
        expires_at: new Date(Date.now() + 300000).toISOString(),
      },
      runtime: {
        provider_session: "old-session",
        profile_id: "profile",
        checkpoint_url: "https://example.com/",
        operation_id: null,
      },
    });
    const response = await handleBrowserCommand(request({ ...input, command: "scroll" }), deps);
    expect(response.status).toBe(409);
    expect(deps.pageMock.scroll).not.toHaveBeenCalled();
    expect(deps.pageMock.inspect).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures and preserves the possible orphan ID for stopping", async () => {
    const deps = dependencies();
    deps.provider.create.mockRejectedValue(new Error("secret provider token"));
    const response = await handleBrowserCommand(request(), deps);
    expect(await response.text()).not.toContain("secret provider token");
    expect(deps.finish).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({ providerSession: requestId, state: "failed" }),
      false,
    );
  });
  it("disables login takeover until the privacy test is explicitly enabled", async () => {
    const deps = dependencies();
    const response = await handleBrowserCommand(request({ ...input, command: "takeover" }), {
      ...deps,
      handoff: () => false,
    });
    expect(response.status).toBe(409);
    expect(deps.claim).not.toHaveBeenCalled();
  });
});
describe("provider configuration and URL handling", () => {
  it("disables provider recording and automatic CAPTCHA solving", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        id: requestId,
        status: "live",
        debugUrl: `https://api.steel.dev/v1/sessions/${requestId}/player`,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await steelProvider.create(requestId, false, null);
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.recordings).toBe(false);
    expect(body.solveCaptcha).toBe(false);
    expect(body.debugConfig.interactive).toBe(false);
    expect(body.timeout).toBe(300000);
  });
  it.each([
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com?token=secret",
    "https://127.0.0.1",
    "https://example.com.evil.invalid",
  ])("rejects unsafe target %s", (value) => {
    expect(() => approvedBrowserUrl(value, ["https://example.com"])).toThrow();
  });
  it("does not accept an arbitrary iframe or debugging endpoint", () => {
    expect(() => safeSteelViewer("https://evil.invalid/viewer")).toThrow();
    expect(() => safeSteelViewer("wss://connect.steel.dev?apiKey=secret")).toThrow();
  });
});
