// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import {
  browserApproval,
  resetOrganizerCapability,
  handleManagedOrganizer,
  executeOrganizerTool,
  toolRequestId,
  OrganizerError,
  type OrganizerDependencies,
} from "@/lib/ai/managed-organizer.server";
const org = "11111111-1111-4111-8111-111111111111",
  requestId = "22222222-2222-4222-8222-222222222222";
const row = {
  id: "local",
  organization_id: org,
  provider_id: "provider-owned",
  lease_id: "lease",
  lease_until: null,
};
const req = (body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  new Request("https://civimeet.example/api/organizer", {
    method: "POST",
    headers: { Authorization: "Bearer fixture", "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      organizationId: org,
      thread: "main",
      action: "send",
      message: "Help us organize a gathering",
      requestId,
      ...body,
    }),
  });
function dependencies() {
  const events = Object.assign(
    (async function* () {
      yield {
        type: "agent.session.turn.output_text.delta",
        item_id: "answer",
        content_index: 0,
        delta: "Hello",
      };
      yield {
        type: "agent.session.turn.output_text.done",
        item_id: "answer",
        content_index: 0,
        text: "Hello community",
      };
      yield { type: "agent.session.turn.completed", turn: { subagent_id: null } };
    })(),
    { controller: new AbortController() },
  );
  const api = {
    retrieve: vi
      .fn()
      .mockResolvedValue({ status: "idle", required_actions: [], usage: { total_tokens: 10 } }),
    create: vi.fn().mockResolvedValue({ id: "new-provider" }),
    delete: vi.fn().mockResolvedValue({}),
    events: {
      create: vi.fn().mockResolvedValue(undefined),
      stream: vi.fn().mockResolvedValue(events),
    },
    items: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: "m",
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Saved venue" }],
          },
        ],
        has_more: false,
      }),
    },
  };
  const d = {
    configuration: () => ({
      ready: true,
      enabled: true,
      provider: "openai",
      browserEnabled: false,
      webSearchEnabled: false,
      dailyMessageLimit: 30,
    }),
    provider: () => api as unknown as ReturnType<OrganizerDependencies["provider"]>,
    authorize: vi.fn().mockResolvedValue("actor"),
    current: vi.fn().mockResolvedValue({ ...row }),
    reserve: vi.fn().mockResolvedValue({ session: { ...row }, replayed: false }),
    update: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockResolvedValue('{"mission":"Community service"}'),
    researchAgent: vi.fn().mockResolvedValue("web-agent"),
    research: vi.fn().mockResolvedValue(Response.json({ run: { status: "completed" } })),
    helpers: vi.fn().mockResolvedValue('{"helpers":[]}'),
    requestPayment: vi.fn().mockResolvedValue('{"status":"needs_approval"}'),
  };
  return { d, api };
}
describe("managed organizer authorization and execution", () => {
  it("streams real provider events and uses the saved session, subscribing before submission", async () => {
    const { d, api } = dependencies();
    const r = await handleManagedOrganizer(req(), d);
    const text = await r.text();
    expect(r.status).toBe(200);
    expect(text).toContain('"text":"Hello community"');
    expect(text).toContain('"status":"completed"');
    expect(api.events.stream).toHaveBeenCalledWith("provider-owned", expect.anything());
    expect(api.events.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      api.events.stream.mock.invocationCallOrder[0]!,
    );
    expect(api.events.create).toHaveBeenCalledWith(
      "provider-owned",
      expect.objectContaining({ "Idempotency-Key": requestId }),
    );
    expect(d.update).toHaveBeenCalledWith(row, { lease_id: null, lease_until: null });
  });
  it("denies a nonmember before touching the provider or reserving a turn", async () => {
    const { d, api } = dependencies();
    d.authorize.mockRejectedValue(new OrganizerError(403, "Denied"));
    expect((await handleManagedOrganizer(req(), d)).status).toBe(403);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(api.retrieve).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied provider IDs", async () => {
    const { d } = dependencies();
    expect((await handleManagedOrganizer(req({ provider_id: "other-tenant" }), d)).status).toBe(
      400,
    );
    expect(d.authorize).not.toHaveBeenCalled();
  });
  it("reports missing configuration honestly without creating a provider session", async () => {
    const { d, api } = dependencies();
    d.configuration = () => ({
      ready: false,
      enabled: false,
      provider: "openai",
      browserEnabled: false,
      webSearchEnabled: false,
      dailyMessageLimit: 30,
    });
    const r = await handleManagedOrganizer(req({ action: "status" }), d);
    expect(await r.json()).toMatchObject({ status: "configuration_required" });
    expect(api.create).not.toHaveBeenCalled();
  });
  it("restores saved messages and requests real provider cancellation", async () => {
    const { d, api } = dependencies();
    expect(await (await handleManagedOrganizer(req({ action: "status" }), d)).json()).toMatchObject(
      { messages: [{ text: "Saved venue" }] },
    );
    expect(await (await handleManagedOrganizer(req({ action: "cancel" }), d)).json()).toEqual({
      status: "cancellation_requested",
    });
    expect(api.events.create).toHaveBeenCalledWith("provider-owned", {
      events: [{ type: "agent.session.input.cancel" }],
    });
  });
  it("does not resubmit a replayed message", async () => {
    const { d, api } = dependencies();
    d.reserve.mockResolvedValue({ session: { ...row }, replayed: true });
    await (await handleManagedOrganizer(req(), d)).text();
    expect(api.events.create).not.toHaveBeenCalled();
  });
  it("starts a new session with organization context, web search and the hosted browser", async () => {
    resetOrganizerCapability();
    const { d, api } = dependencies();
    d.reserve.mockResolvedValue({
      session: { ...row, provider_id: null } as unknown as typeof row,
      replayed: false,
    });
    await (await handleManagedOrganizer(req(), d)).text();
    const config = api.create.mock.calls[0]![0];
    expect(config.agent.instructions).toContain("Community service");
    expect(config.input).toBe("Help us organize a gathering");
    expect(config.agent.reasoning.effort).toBe("medium");
    expect(config.spend_control).toBeUndefined();
    const types = config.agent.tools.map((t: { type: string }) => t.type);
    expect(types).toContain("web_search");
    expect(types).toContain("computer_use");
    expect(config.environment).toMatchObject({
      type: "openai_hosted",
      desktop: { enabled: true },
      network: { access: "restricted" },
    });
    expect(config.environment.network.blocked_domains).toEqual(
      expect.arrayContaining(["facebook.com", "www.facebook.com", "instagram.com", "linkedin.com"]),
    );
    expect(api.events.create).not.toHaveBeenCalled();
  });
  it("keeps the conversation working when OpenAI rejects the browser, then web search", async () => {
    resetOrganizerCapability();
    const { d, api } = dependencies();
    d.reserve.mockImplementation(async () => ({
      session: { ...row, provider_id: null } as unknown as typeof row,
      replayed: false,
    }));
    api.create
      .mockRejectedValueOnce(providerError(400))
      .mockRejectedValueOnce(providerError(400))
      .mockResolvedValue({ id: "new-provider" });
    const r = await handleManagedOrganizer(req(), d);
    const text = await r.text();
    expect(r.status).toBe(200);
    expect(api.create).toHaveBeenCalledTimes(3);
    expect(api.create.mock.calls[1]![0].environment.type).toBe("none");
    expect(api.create.mock.calls[1]![0].agent.tools.map((t: { type: string }) => t.type)).toContain(
      "web_search",
    );
    expect(
      api.create.mock.calls[2]![0].agent.tools.every(
        (t: { type: string }) => t.type === "function",
      ),
    ).toBe(true);
    expect(text).toContain("aren't available on this OpenAI project yet");
    // The next conversation goes straight to what this project accepted.
    api.create.mockClear();
    await (await handleManagedOrganizer(req(), d)).text();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create.mock.calls[0]![0].environment.type).toBe("none");
    resetOrganizerCapability();
  });
  it("does not hide a bad API key behind a simpler setup", async () => {
    resetOrganizerCapability();
    const { d, api } = dependencies();
    d.reserve.mockResolvedValue({
      session: { ...row, provider_id: null } as unknown as typeof row,
      replayed: false,
    });
    api.create.mockRejectedValue(providerError(401));
    const r = await handleManagedOrganizer(req(), d);
    expect(r.status).toBe(424);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it("answers browser site requests by policy and declines every sign-in", async () => {
    const { d, api } = dependencies();
    api.retrieve.mockResolvedValue({
      status: "requires_action",
      usage: { total_tokens: 10 },
      required_actions: [
        {
          type: "computer_use_approval_request",
          request_id: "site-1",
          turn_id: "t",
          request: {
            type: "browser_origin_access",
            origin: "https://www.reidpark.org",
            reason: null,
          },
        },
        {
          type: "computer_use_approval_request",
          request_id: "site-2",
          turn_id: "t",
          request: {
            type: "browser_origin_access",
            origin: "https://www.facebook.com",
            reason: null,
          },
        },
        {
          type: "computer_use_approval_request",
          request_id: "login-1",
          turn_id: "t",
          request: {
            type: "browser_authentication",
            credential_origin: "https://example.org",
            fields: [{ id: "p", label: "Password", required: true, type: "password" }],
            options: [],
            reason: "Sign in",
          },
        },
      ],
    });
    const text = await (await handleManagedOrganizer(req({ action: "resume" }), d)).text();
    const responses = api.events.create.mock.calls.map(
      (call: unknown[]) => (call[1] as { events: unknown[] }).events[0],
    );
    expect(responses).toEqual([
      expect.objectContaining({
        request_id: "site-1",
        response: { type: "browser_origin_access", decision: "approve" },
      }),
      expect.objectContaining({
        request_id: "site-2",
        response: { type: "browser_origin_access", decision: "deny" },
      }),
      expect.objectContaining({
        request_id: "login-1",
        response: { type: "browser_authentication", action: "cancel" },
      }),
    ]);
    expect(text).toContain("doesn't sign in to accounts");
    expect(text).not.toContain("Password");
  });
  it("streams what Civi's browser shows without storing it", async () => {
    const { d, api } = dependencies();
    api.events.stream.mockResolvedValue(
      Object.assign(
        (async function* () {
          yield {
            type: "agent.session.turn.item.done",
            item: {
              id: "c1",
              type: "computer_use_call",
              title: "Reading the pavilion page",
              output: { type: "computer_screenshot", image_url: "data:image/jpeg;base64,AAAA" },
            },
          };
          yield { type: "agent.session.turn.completed", turn: { subagent_id: null } };
        })(),
        { controller: new AbortController() },
      ),
    );
    const text = await (await handleManagedOrganizer(req(), d)).text();
    expect(text).toContain('"type":"browser"');
    expect(text).toContain("Reading the pavilion page");
    expect(text).toContain("data:image/jpeg;base64,AAAA");
    expect(d.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ screenshot: expect.anything() }),
    );
  });
  it("reconnects instead of cancelling a long task, with keep-alive pings meanwhile", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const previous = process.env["OPENAI_ORGANIZER_TIMEOUT_MS"];
    process.env["OPENAI_ORGANIZER_TIMEOUT_MS"] = "15000";
    try {
      const { d, api } = dependencies();
      api.events.stream.mockImplementation(
        async (_id: string, { signal }: { signal: AbortSignal }) =>
          Object.assign(
            (async function* () {
              await new Promise((_, reject) =>
                signal.addEventListener("abort", () => reject(new Error("aborted"))),
              );
            })(),
            { controller: new AbortController() },
          ),
      );
      const r = await handleManagedOrganizer(req(), d);
      const body = r.text();
      await vi.advanceTimersByTimeAsync(15_000);
      const text = await body;
      expect(text).toContain('"type":"ping"');
      expect(text).toContain('"type":"continue"');
      expect(api.events.create).not.toHaveBeenCalledWith(
        "provider-owned",
        expect.objectContaining({ events: [{ type: "agent.session.input.cancel" }] }),
      );
      expect(d.update).toHaveBeenCalledWith(row, { lease_id: null, lease_until: null });
    } finally {
      if (previous === undefined) delete process.env["OPENAI_ORGANIZER_TIMEOUT_MS"];
      else process.env["OPENAI_ORGANIZER_TIMEOUT_MS"] = previous;
      vi.useRealTimers();
    }
  });
  it("blocks cross-site and oversized requests before authentication", async () => {
    const { d } = dependencies();
    expect(
      (await handleManagedOrganizer(req({}, { Origin: "https://other.example" }), d)).status,
    ).toBe(403);
    expect((await handleManagedOrganizer(req({ message: "x".repeat(33000) }), d)).status).toBe(413);
    expect(d.authorize).not.toHaveBeenCalled();
  });
  it("research uses the authorized org, selected agent and stable call ID", async () => {
    const { d } = dependencies();
    const scope = {
      org,
      actor: "actor",
      token: "fixture",
      url: "https://civimeet.example",
      callId: "call-1",
    };
    await executeOrganizerTool(
      "research_local",
      { question: "Find local venues", location: "Tucson" },
      scope,
      d,
    );
    const body = await d.research.mock.calls[0]![0].json();
    expect(body).toMatchObject({
      organizationId: org,
      agentId: "web-agent",
      requestId: toolRequestId("call-1"),
      collectVendors: true,
      purpose: "vendors",
    });
    await expect(executeOrganizerTool("send_message", {}, scope, d)).rejects.toThrow(
      "not available",
    );
    await expect(
      executeOrganizerTool(
        "research_local",
        { question: "Find venues", location: "Tucson", organizationId: "other" },
        scope,
        d,
      ),
    ).rejects.toThrow();
  });
  it("routes Civi's payment requests through the signed-in person's budget check", async () => {
    const { d } = dependencies();
    const scope = {
      org,
      actor: "actor",
      token: "fixture",
      url: "https://civimeet.example",
      callId: "call_1",
    };
    await executeOrganizerTool(
      "request_payment",
      { payee: "Reid Park", purpose: "Pavilion deposit", category: "venue", amount_usd: 250 },
      scope,
      d,
    );
    expect(d.authorize).toHaveBeenCalledWith("fixture", org);
    expect(d.requestPayment).toHaveBeenCalledWith(
      "fixture",
      org,
      expect.objectContaining({ amount_usd: 250, category: "venue" }),
    );
    await expect(
      executeOrganizerTool(
        "request_payment",
        { payee: "X", purpose: "?", category: "venue", amount_usd: -5 },
        scope,
        d,
      ),
    ).rejects.toThrow();
  });
});
import { organizerModel } from "@/lib/ai/managed-organizer.server";
describe("organizer model setting", () => {
  it("uses the configured model name and ignores text that isn't one", () => {
    expect(organizerModel({ OPENAI_ORGANIZER_MODEL: "gpt-5.5" })).toBe("gpt-5.5");
    expect(
      organizerModel({
        OPENAI_ORGANIZER_MODEL:
          "please use the newest chat gpt model for our community agent ".repeat(3),
      }),
    ).toBe("gpt-6-sol");
    expect(organizerModel({})).toBe("gpt-6-sol");
  });
});
import OpenAI from "openai";
import { retryTransient } from "@/lib/ai/managed-organizer.server";
const providerError = (status: number) =>
  OpenAI.APIError.generate(
    status,
    {
      message: "fixture",
      type: "fixture",
      code: status === 503 ? "service_unavailable_error" : "fixture",
    },
    "fixture",
    new Headers(),
  );
describe("organizer provider hiccups", () => {
  it("retries a safe provider call after a temporary 503 and then succeeds", async () => {
    const call = vi.fn().mockRejectedValueOnce(providerError(503)).mockResolvedValue("ok");
    await expect(retryTransient(call, [0, 0])).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("does not retry configuration errors such as a bad model", async () => {
    const call = vi.fn().mockRejectedValue(providerError(400));
    await expect(retryTransient(call, [0, 0])).rejects.toBeInstanceOf(OpenAI.APIError);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("answers a lasting OpenAI outage with 503 and a JSON explanation, never 502", async () => {
    const { d, api } = dependencies();
    api.retrieve.mockRejectedValue(providerError(503));
    const r = await handleManagedOrganizer(req(), d);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      retryable: true,
      error: expect.stringContaining("busy"),
    });
    expect(api.retrieve).toHaveBeenCalledTimes(3);
    expect(d.update).toHaveBeenCalledWith(expect.objectContaining({ id: "local" }), {
      lease_id: null,
      lease_until: null,
    });
  });
  it("reports OpenAI configuration problems as 424 without retrying", async () => {
    const { d, api } = dependencies();
    api.retrieve.mockRejectedValue(providerError(404));
    const r = await handleManagedOrganizer(req(), d);
    expect(r.status).toBe(424);
    expect(api.retrieve).toHaveBeenCalledTimes(1);
  });
});
describe("Civi's browser site policy", () => {
  it("allows public websites and refuses social networks, private addresses and sign-ins", () => {
    const decide = (origin: string) =>
      browserApproval({ type: "browser_origin_access", origin }) as { decision: string };
    expect(decide("https://www.reidpark.org").decision).toBe("approve");
    expect(decide("https://www.eventbrite.com").decision).toBe("approve");
    for (const origin of [
      "https://www.facebook.com",
      "https://web.facebook.com",
      "https://m.instagram.com",
      "https://www.linkedin.com",
      "https://x.com",
      "https://nextdoor.com",
      "http://localhost:3000",
      "http://192.168.1.4",
      "file:///etc/passwd",
      "not a url",
    ])
      expect(decide(origin).decision, origin).toBe("deny");
    expect(browserApproval({ type: "browser_authentication" })).toEqual({
      type: "browser_authentication",
      action: "cancel",
    });
  });
});
