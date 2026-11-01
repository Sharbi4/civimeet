// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { allowedUrl, checkAction, isSignInPage, safetyCheckText } from "@/lib/browser-agent-policy";
import { handleAgentBrowser, type AgentBrowserDeps } from "@/lib/browser-agent.server";
import { museTurn, type MuseRequest } from "@/lib/muse.server";
import type { SteelPage } from "@/lib/steel.server";

const env = {
  MUSE_API_KEY: "LLM_1_secret",
  STEEL_API_KEY: "steel",
  SUPABASE_URL: "x",
  SUPABASE_SERVICE_ROLE_KEY: "y",
};
const shot = "data:image/jpeg;base64,AAAA";

describe("read-only policy", () => {
  const link = (text: string, href = "") => ({
    tag: href ? "a" : "button",
    role: "",
    type: "",
    text,
    href,
    editable: false,
    composer: false,
  });
  it("lets the agent look, scroll and open links inside the platform", () => {
    expect(
      checkAction(
        { type: "scroll", x: 1, y: 1, scroll_x: 0, scroll_y: 400 },
        { connector: "facebook" },
      ),
    ).toEqual({ allowed: true });
    expect(
      checkAction(
        { type: "click", x: 5, y: 5, button: "left" },
        { connector: "facebook", point: link("Pages", "https://www.facebook.com/pages/") },
      ),
    ).toEqual({ allowed: true });
  });
  it("refuses anything that would post, send, join or react", () => {
    for (const text of [
      "Post",
      "Send",
      "Join group",
      "Like",
      "Comment",
      "Share now",
      "Follow",
      "Donate",
    ]) {
      expect(
        checkAction(
          { type: "click", x: 5, y: 5, button: "left" },
          { connector: "facebook", point: link(text) },
        ).allowed,
      ).toBe(false);
    }
    expect(
      checkAction(
        { type: "click", x: 5, y: 5 },
        { connector: "facebook", point: { ...link("What's on your mind?"), editable: true } },
      ).allowed,
    ).toBe(false);
    expect(
      checkAction({ type: "drag", path: [{ x: 1, y: 1 }] }, { connector: "facebook" }).allowed,
    ).toBe(false);
  });
  it("refuses links that leave the platform and sharing dialogs", () => {
    expect(
      checkAction(
        { type: "click", x: 5, y: 5 },
        { connector: "facebook", point: link("Read more", "https://evil.example/") },
      ).allowed,
    ).toBe(false);
    expect(
      checkAction(
        { type: "click", x: 5, y: 5 },
        {
          connector: "facebook",
          point: link("Share", "https://www.facebook.com/sharer/sharer.php"),
        },
      ).allowed,
    ).toBe(false);
  });
  it("types only into search boxes and never into password fields", () => {
    expect(
      checkAction(
        { type: "type", text: "food bank" },
        {
          connector: "facebook",
          focus: { tag: "input", type: "search", role: "", label: "Search Facebook", search: true },
        },
      ),
    ).toEqual({ allowed: true });
    expect(
      checkAction(
        { type: "type", text: "hello" },
        {
          connector: "facebook",
          focus: { tag: "div", type: "", role: "textbox", label: "Write a comment", search: false },
        },
      ).allowed,
    ).toBe(false);
    expect(
      checkAction(
        { type: "type", text: "pw" },
        {
          connector: "facebook",
          focus: { tag: "input", type: "password", role: "", label: "", search: false },
        },
      ),
    ).toMatchObject({ allowed: false, human: true });
    expect(
      checkAction(
        { type: "keypress", keys: ["Enter"] },
        {
          connector: "facebook",
          focus: { tag: "div", type: "", role: "", label: "", search: false },
        },
      ).allowed,
    ).toBe(false);
    expect(
      checkAction(
        { type: "keypress", keys: ["CTRL", "Enter"] },
        { connector: "facebook", focus: null },
      ).allowed,
    ).toBe(false);
    expect(
      checkAction({ type: "keypress", keys: ["PageDown"] }, { connector: "facebook", focus: null }),
    ).toEqual({ allowed: true });
  });
  it("knows each platform's sites and its sign-in pages", () => {
    expect(allowedUrl("https://m.facebook.com/groups", "facebook")).toBe(true);
    expect(allowedUrl("https://facebook.com.evil.example/", "facebook")).toBe(false);
    expect(allowedUrl("https://www.instagram.com/", "facebook")).toBe(false);
    expect(isSignInPage("https://www.facebook.com/checkpoint/123")).toBe(true);
    expect(isSignInPage("https://www.facebook.com/CommunityAlliance")).toBe(false);
  });
});

describe("Muse client", () => {
  const reply = (body: unknown, status = 200) => vi.fn(async () => Response.json(body, { status }));
  const start: MuseRequest = {
    kind: "start",
    instructions: "read-only",
    task: "Show our Page",
    screenshot: shot,
  };
  it("sends the documented computer-use request and parses batched actions, safety checks and cost", async () => {
    const fetcher = reply({
      id: "resp_1",
      output: [
        {
          type: "computer_call",
          call_id: "call_1",
          actions: [
            { type: "click", button: "left", x: 412, y: 315 },
            { type: "scroll", x: 1, y: 1, scroll_x: 0, scroll_y: 300 },
          ],
          pending_safety_checks: [
            { id: "csc_1", code: "malicious_instructions", message: "Check" },
          ],
        },
      ],
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 10_000,
        input_tokens_details: { cached_tokens: 0 },
      },
    });
    const turn = await museTurn(start, { env, fetcher: fetcher as never });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer LLM_1_secret");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "muse-wonder-1.0", tools: [{ type: "computer" }] });
    expect(body.input[0].content[1]).toEqual({ type: "input_image", image_url: shot });
    expect(turn.call?.actions).toHaveLength(2);
    expect(turn.call?.pending_safety_checks[0]?.code).toBe("malicious_instructions");
    expect(turn.usage.cost_usd).toBe(4.2);
  });
  it("continues with the screenshot as computer_call_output and resends instructions", async () => {
    const fetcher = reply({
      id: "resp_2",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "Your Page has 3 recent posts." }],
        },
      ],
    });
    const turn = await museTurn(
      {
        kind: "continue",
        instructions: "read-only",
        previousResponseId: "resp_1",
        callId: "call_1",
        screenshot: shot,
        acknowledged: [],
        note: "Blocked: Post",
      },
      { env, fetcher: fetcher as never },
    );
    const body = JSON.parse(
      String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body).toMatchObject({ previous_response_id: "resp_1", instructions: "read-only" });
    expect(body.input[0]).toEqual({
      type: "computer_call_output",
      call_id: "call_1",
      acknowledged_safety_checks: [],
      output: { type: "computer_screenshot", image_url: shot },
    });
    expect(body.input[1].content[0].text).toBe("Blocked: Post");
    expect(turn.call).toBeNull();
    expect(turn.message).toBe("Your Page has 3 recent posts.");
  });
  it("refuses to run without a key and explains invalid keys", async () => {
    await expect(museTurn(start, { env: {} })).rejects.toThrow("Add MUSE_API_KEY");
    await expect(
      museTurn(start, {
        env,
        fetcher: reply({ error: { code: "invalid_api_key" } }, 401) as never,
      }),
    ).rejects.toThrow("Meta rejected the API key");
  });
  it("explains Meta's refusal to continue without a safety decision", async () => {
    await expect(
      museTurn(start, {
        env,
        fetcher: reply(
          {
            error: {
              type: "invalid_request_error",
              code: null,
              message: "Every pending computer safety check must be acknowledged exactly once",
            },
          },
          400,
        ) as never,
      }),
    ).rejects.toThrow("until a person decides");
  });
  it("puts Meta's safety codes in plain words", () => {
    expect(safetyCheckText({ code: "computer_action_requires_confirmation", message: null })).toBe(
      "Meta asks a person to confirm this action before it runs.",
    );
    expect(safetyCheckText({ code: "some_new_code", message: null })).toContain("some new code");
    expect(safetyCheckText({ code: null, message: "Check this" })).toBe("Check this");
  });
  it("retries busy responses a bounded number of times", async () => {
    const fetcher = reply({ error: { code: "service_overloaded" } }, 503);
    await expect(museTurn(start, { env, fetcher: fetcher as never, retries: 1 })).rejects.toThrow(
      "busy",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  }, 10_000);
});

// ---- Executor with a simulated Steel page and scripted Muse turns ----
const org = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
function fakePage(state: { url: string; point?: object }) {
  return {
    navigate: vi.fn(async (url: string) => void (state.url = url)),
    location: vi.fn(async () => ({
      url: state.url,
      title: "Tucson Community Alliance | Facebook",
    })),
    capture: vi.fn(async () => ({ dataUrl: shot, width: 1280, height: 800 })),
    inspectPoint: vi.fn(async () => state.point ?? null),
    activeElement: vi.fn(async () => ({
      tag: "body",
      type: "",
      role: "",
      label: "",
      search: false,
    })),
    clickAt: vi.fn(async () => {}),
    mouse: vi.fn(async () => {}),
    wheel: vi.fn(async () => {}),
    insertText: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    historyBack: vi.fn(async () => {}),
  };
}
function harness(
  options: {
    turns?: object[];
    run?: object;
    runtime?: object;
    page?: ReturnType<typeof fakePage>;
    profile?: object | null;
  } = {},
) {
  const page = options.page ?? fakePage({ url: "https://www.facebook.com/" });
  const finished: {
    outcome: Record<string, unknown>;
    events: { kind: string; summary: string }[];
  }[] = [];
  const turns = [...(options.turns ?? [])];
  const deps = {
    env,
    authorize: vi.fn(async () => ({ actor: "admin", organization: org })),
    organizationName: vi.fn(async () => "Tucson Community Alliance"),
    startRun: vi.fn(async () => runId),
    claim: vi.fn(async () => ({
      run: {
        id: runId,
        organization_id: org,
        connector: "facebook",
        agent: "facebook",
        objective: "Show me our Facebook Page",
        status: "running",
        step_count: 0,
        max_steps: 12,
        current_url: "",
        usage: {},
        created_by: "admin",
        ...(options.run ?? {}),
      },
      runtime: {
        provider_session: "33333333-3333-4333-8333-333333333333",
        profile_id: "p",
        previous_response_id: null,
        pending_call: null,
        pending_safety_checks: null,
        acknowledged_safety_checks: null,
        lease_id: "lease",
        ...(options.runtime ?? {}),
      },
    })),
    finish: vi.fn(
      async (
        _run: string,
        _lease: string,
        outcome: Record<string, unknown>,
        events: { kind: string; summary: string }[],
      ) => void finished.push({ outcome, events }),
    ),
    connectorProfile: vi.fn(async () =>
      options.profile === undefined
        ? { profileId: "p", providerSession: null, status: "connected" }
        : options.profile,
    ),
    provider: {
      create: vi.fn(async (id: string) => ({
        id,
        profileId: "p",
        viewer: "https://api.steel.dev/v1/sessions/x/player",
      })),
      release: vi.fn(async () => {}),
      live: vi.fn(async () => ({
        live: true,
        viewer: "https://api.steel.dev/v1/sessions/33333333-3333-4333-8333-333333333333/player",
      })),
    },
    page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) =>
      work(page as unknown as SteelPage),
    ),
    muse: vi.fn(async () => {
      const next = turns.shift();
      if (!next) throw new Error("no scripted turn");
      return next;
    }),
    newSessionId: () => "44444444-4444-4444-8444-444444444444",
    remember: vi.fn(async () => {}),
  };
  return { deps: deps as unknown as Partial<AgentBrowserDeps>, raw: deps, page, finished };
}
const request = (body: unknown) =>
  new Request("https://civimeet.com/api/agent/browser", {
    method: "POST",
    headers: { Authorization: "Bearer s", "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: org, ...(body as object) }),
  });
const usage = { input_tokens: 2000, cached_tokens: 0, output_tokens: 50, cost_usd: 0.009 };

describe("computer-use executor", () => {
  it("won't start without the Muse key, and says how to fix it", async () => {
    const { deps } = harness();
    const response = await handleAgentBrowser(
      request({ command: "start", platform: "facebook", objective: "Show me our Facebook Page" }),
      { ...deps, env: { STEEL_API_KEY: "s" } },
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("MUSE_API_KEY");
  });
  it("only browses social platforms through their own connection", async () => {
    const { deps, raw } = harness({
      profile: { profileId: null, providerSession: null, status: "not_connected" },
    });
    const response = await handleAgentBrowser(
      request({ command: "start", platform: "facebook", objective: "Show me our Facebook Page" }),
      deps,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Connect Facebook first");
    expect(raw.startRun).not.toHaveBeenCalled();
  });
  it("denies people who can't run the agent browser", async () => {
    const { AgentBrowserError } = await import("@/lib/browser-agent.server");
    const { deps } = harness();
    const response = await handleAgentBrowser(request({ command: "step", runId }), {
      ...deps,
      authorize: vi.fn(async () =>
        Promise.reject(
          new AgentBrowserError(
            403,
            "Only an organization owner or administrator can run the agent browser.",
          ),
        ),
      ),
    });
    expect(response.status).toBe(403);
  });
  it("observes, asks Muse, executes allowed actions and records real events", async () => {
    const state = {
      url: "https://www.facebook.com/",
      point: {
        tag: "a",
        role: "",
        type: "",
        text: "Tucson Community Alliance",
        href: "https://www.facebook.com/tca",
        editable: false,
        composer: false,
      },
    };
    const page = fakePage(state);
    const { deps, raw, finished } = harness({
      page,
      turns: [
        {
          id: "resp_1",
          message: "",
          usage,
          call: {
            call_id: "call_1",
            pending_safety_checks: [],
            actions: [
              { type: "click", x: 300, y: 200, button: "left" },
              { type: "scroll", x: 600, y: 400, scroll_x: 0, scroll_y: 500 },
            ],
          },
        },
      ],
    });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect((raw.muse.mock.calls[0] as unknown[])[0]).toMatchObject({
      kind: "start",
      screenshot: shot,
    });
    expect(page.clickAt).toHaveBeenCalledWith(300, 200, "left", 1);
    expect(page.wheel).toHaveBeenCalledWith(600, 400, 0, 500);
    expect(body).toMatchObject({ status: "running", screenshot: shot });
    expect(finished[0]!.outcome).toMatchObject({
      status: "running",
      previousResponseId: "resp_1",
      pendingCall: { call_id: "call_1" },
      steps: 1,
    });
    expect(finished[0]!.events.map((event) => event.kind)).toEqual(["action", "action"]);
  });
  it("blocks a consequential click before it happens and tells Muse why", async () => {
    const page = fakePage({
      url: "https://www.facebook.com/tca",
      point: {
        tag: "button",
        role: "button",
        type: "",
        text: "Post",
        href: "",
        editable: false,
        composer: false,
      },
    });
    const { deps, finished } = harness({
      page,
      turns: [
        {
          id: "resp_2",
          message: "",
          usage,
          call: {
            call_id: "call_2",
            pending_safety_checks: [],
            actions: [{ type: "click", x: 900, y: 120, button: "left" }],
          },
        },
      ],
    });
    await handleAgentBrowser(request({ command: "step", runId }), deps);
    expect(page.clickAt).not.toHaveBeenCalled();
    expect(finished[0]!.events[0]).toMatchObject({ kind: "blocked" });
    expect(String((finished[0]!.outcome["pendingCall"] as { note: string }).note)).toContain(
      "blocked",
    );
  });
  it("waits for a person on Meta safety checks instead of acknowledging them", async () => {
    const page = fakePage({ url: "https://www.facebook.com/" });
    const { deps, finished } = harness({
      page,
      turns: [
        {
          id: "resp_3",
          message: "",
          usage,
          call: {
            call_id: "call_3",
            pending_safety_checks: [
              {
                id: "csc_1",
                code: "malicious_instructions",
                message: "Page text asked the agent to post",
              },
            ],
            actions: [{ type: "click", x: 1, y: 1 }],
          },
        },
      ],
    });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect(body.status).toBe("waiting_for_human");
    expect(page.clickAt).not.toHaveBeenCalled();
    expect(finished[0]!.outcome).toMatchObject({
      pendingSafetyChecks: [{ id: "csc_1" }],
      acknowledgedSafetyChecks: null,
    });
  });
  it("shows what the agent wants to do, and Civi's verdict, when Meta asks for confirmation", async () => {
    // Shape seen live from muse-spark-1.3: a benign click flagged computer_action_requires_confirmation.
    const page = fakePage({
      url: "https://www.facebook.com/",
      point: {
        tag: "a",
        role: "",
        type: "",
        text: "Tucson Community Alliance",
        href: "https://www.facebook.com/tca",
        editable: false,
        composer: false,
      },
    });
    const { deps, finished } = harness({
      page,
      turns: [
        {
          id: "resp_7",
          model: "muse-spark-1.3",
          message: "I'll open the Page.",
          usage,
          call: {
            call_id: "call_7",
            pending_safety_checks: [
              { id: "csc_7", code: "computer_action_requires_confirmation", message: null },
            ],
            actions: [{ type: "click", x: 640, y: 431, button: "left" }],
          },
        },
      ],
      run: { model: "muse-spark-1.3" },
    });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect(page.clickAt).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      status: "waiting_for_human",
      proposed: [{ summary: "Click at 640, 431 (“Tucson Community Alliance”)", allowed: true }],
      screenshot: shot,
    });
    expect(body.detail).toContain("confirm this action");
    expect(finished[0]!.events.map((event) => event.kind)).toEqual(["model", "safety_check"]);
  });
  it("marks proposed actions that Civi's read-only policy would refuse anyway", async () => {
    const page = fakePage({
      url: "https://www.facebook.com/tca",
      point: {
        tag: "button",
        role: "button",
        type: "",
        text: "Post",
        href: "",
        editable: false,
        composer: false,
      },
    });
    const { deps } = harness({
      page,
      turns: [
        {
          id: "resp_8",
          message: "",
          usage,
          call: {
            call_id: "call_8",
            pending_safety_checks: [{ id: "csc_8", code: "malicious_instructions", message: null }],
            actions: [{ type: "click", x: 900, y: 120, button: "left" }],
          },
        },
      ],
    });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect(body.proposed[0]).toMatchObject({ allowed: false });
    expect(page.clickAt).not.toHaveBeenCalled();
  });
  it("on Allow, runs the flagged actions through the policy and acknowledges each check exactly once", async () => {
    const checks = [{ id: "csc_9", code: "computer_action_requires_confirmation", message: null }];
    const page = fakePage({
      url: "https://www.facebook.com/",
      point: {
        tag: "a",
        role: "",
        type: "",
        text: "Events",
        href: "https://www.facebook.com/events",
        editable: false,
        composer: false,
      },
    });
    const waiting = {
      run: { status: "waiting_for_human", step_count: 2, model: "muse-spark-1.3" },
      runtime: {
        previous_response_id: "resp_9",
        pending_call: { call_id: "call_9", actions: [{ type: "click", x: 50, y: 60 }] },
        pending_safety_checks: checks,
      },
    };
    const approved = harness({ page, ...waiting });
    const body = await (
      await handleAgentBrowser(request({ command: "approve_safety", runId }), approved.deps)
    ).json();
    expect(body.status).toBe("running");
    expect(page.clickAt).toHaveBeenCalledWith(50, 60, "left", 1);
    expect(approved.raw.muse).not.toHaveBeenCalled();
    expect(approved.finished[0]!.outcome).toMatchObject({
      status: "running",
      pendingSafetyChecks: null,
      acknowledgedSafetyChecks: checks,
      pendingCall: { call_id: "call_9", actions: [] },
    });

    // The next step sends the acknowledgement with the fresh screenshot, then clears it.
    const next = harness({
      page,
      run: { step_count: 2, model: "muse-spark-1.3" },
      runtime: {
        previous_response_id: "resp_9",
        pending_call: { call_id: "call_9", actions: [] },
        acknowledged_safety_checks: checks,
      },
      turns: [
        {
          id: "resp_10",
          model: "muse-spark-1.3",
          message: "",
          usage,
          call: {
            call_id: "call_10",
            pending_safety_checks: [],
            actions: [{ type: "scroll", x: 600, y: 400, scroll_x: 0, scroll_y: 400 }],
          },
        },
      ],
    });
    await handleAgentBrowser(request({ command: "step", runId }), next.deps);
    expect((next.raw.muse.mock.calls[0] as unknown[])[0]).toMatchObject({
      kind: "continue",
      callId: "call_9",
      acknowledged: checks,
    });
    expect(next.finished[0]!.outcome).toMatchObject({ acknowledgedSafetyChecks: null });
  });
  it("on Stop, ends the run without acknowledging anything or calling Muse", async () => {
    const { deps, raw, finished, page } = harness({
      run: { status: "waiting_for_human" },
      runtime: {
        previous_response_id: "resp_11",
        pending_call: { call_id: "call_11", actions: [{ type: "click", x: 1, y: 1 }] },
        pending_safety_checks: [{ id: "csc_11", code: null, message: "Review" }],
      },
    });
    const body = await (
      await handleAgentBrowser(request({ command: "decline_safety", runId }), deps)
    ).json();
    expect(body.status).toBe("cancelled");
    expect(raw.muse).not.toHaveBeenCalled();
    expect(page.clickAt).not.toHaveBeenCalled();
    expect(raw.provider.release).toHaveBeenCalled();
    expect(finished[0]!.outcome).toMatchObject({ status: "cancelled", pendingSafetyChecks: null });
  });
  it("hands sign-in and verification pages to a person without calling Muse", async () => {
    const { deps, raw } = harness({
      page: fakePage({ url: "https://www.facebook.com/checkpoint/1" }),
    });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect(body.status).toBe("waiting_for_human");
    expect(raw.muse).not.toHaveBeenCalled();
  });
  it("reports completion only with the page it actually ended on, and remembers it", async () => {
    const { deps, raw, finished } = harness({
      page: fakePage({ url: "https://www.facebook.com/tca" }),
      runtime: { previous_response_id: "resp_1", pending_call: { call_id: "call_1", actions: [] } },
      turns: [
        {
          id: "resp_4",
          call: null,
          usage,
          message: "Your Page “Tucson Community Alliance” shows 3 posts this week.",
        },
      ],
    });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect((raw.muse.mock.calls[0] as unknown[])[0]).toMatchObject({
      kind: "continue",
      previousResponseId: "resp_1",
      callId: "call_1",
    });
    expect(body).toMatchObject({
      status: "succeeded",
      result: {
        url: "https://www.facebook.com/tca",
        title: "Tucson Community Alliance | Facebook",
      },
    });
    expect(raw.provider.release).toHaveBeenCalled();
    expect(raw.remember).toHaveBeenCalled();
    expect(finished[0]!.outcome).toMatchObject({ status: "succeeded", providerSession: "" });
  });
  it("stops at the step limit", async () => {
    const { deps, raw } = harness({ run: { step_count: 12, max_steps: 12 } });
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect(body.status).toBe("failed");
    expect(raw.muse).not.toHaveBeenCalled();
  });
  it("records a real failure and closes the browser when Muse fails", async () => {
    const { MuseError } = await import("@/lib/muse.server");
    const { deps, raw, finished } = harness();
    raw.muse.mockRejectedValueOnce(
      new MuseError(401, "Meta rejected the API key. Check MUSE_API_KEY in the server secrets."),
    );
    const body = await (await handleAgentBrowser(request({ command: "step", runId }), deps)).json();
    expect(body).toEqual({
      status: "failed",
      detail: "Meta rejected the API key. Check MUSE_API_KEY in the server secrets.",
    });
    expect(raw.provider.release).toHaveBeenCalled();
    expect(finished.at(-1)!.outcome).toMatchObject({ status: "failed" });
  });
  it("reopens an expired browser in the same signed-in profile", async () => {
    const { deps, raw } = harness({
      turns: [{ id: "r", call: null, usage, message: "Done looking." }],
    });
    raw.provider.live.mockResolvedValueOnce({ live: false, viewer: "" });
    await handleAgentBrowser(request({ command: "step", runId }), deps);
    expect(raw.provider.create).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      true,
      "p",
    );
  });
  it("supports take control, hand back, pause and stop", async () => {
    let h = harness();
    const takeover = await (
      await handleAgentBrowser(request({ command: "takeover", runId }), h.deps)
    ).json();
    expect(takeover).toMatchObject({
      status: "waiting_for_human",
      viewer: expect.stringContaining("api.steel.dev"),
    });
    h = harness({ run: { status: "waiting_for_human" } });
    expect(
      (await (await handleAgentBrowser(request({ command: "release", runId }), h.deps)).json())
        .status,
    ).toBe("running");
    h = harness();
    expect(
      (await (await handleAgentBrowser(request({ command: "pause", runId }), h.deps)).json())
        .status,
    ).toBe("paused");
    h = harness();
    expect(
      (await (await handleAgentBrowser(request({ command: "stop", runId }), h.deps)).json()).status,
    ).toBe("cancelled");
    expect(h.raw.provider.release).toHaveBeenCalled();
  });
});

describe("Muse Wonder availability", () => {
  const start: MuseRequest = {
    kind: "start",
    instructions: "read-only",
    task: "Show our Page",
    screenshot: shot,
  };
  it("starts on Muse Wonder and falls back to Muse Spark 1.3 when Meta refuses computer use for Wonder", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model;
      return model === "muse-wonder-1.0"
        ? Response.json(
            {
              error: {
                type: "invalid_request_error",
                code: null,
                message: "Unsupported tool type: 'computer'",
              },
            },
            { status: 400 },
          )
        : Response.json({
            id: "resp_s",
            output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
          });
    });
    const turn = await museTurn(start, { env, fetcher: fetcher as never });
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model)).toEqual([
      "muse-wonder-1.0",
      "muse-spark-1.3",
    ]);
    expect(turn.model).toBe("muse-spark-1.3");
  });
  it("never switches models in the middle of a run's response chain", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { type: "invalid_request_error", message: "Unsupported tool type: 'computer'" } },
        { status: 400 },
      ),
    );
    await expect(
      museTurn(
        {
          kind: "continue",
          instructions: "x",
          previousResponseId: "r",
          callId: "c",
          screenshot: shot,
          acknowledged: [],
        },
        { env, fetcher: fetcher as never, model: "muse-wonder-1.0" },
      ),
    ).rejects.toThrow("doesn't accept computer use");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("explains Meta billing problems instead of retrying", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { type: "billing_error", code: "billing_not_configured" } },
        { status: 402 },
      ),
    );
    await expect(museTurn(start, { env, fetcher: fetcher as never })).rejects.toThrow(
      "dev.meta.ai/billing",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("records in the run when Spark had to stand in for Wonder", async () => {
    const { deps, finished } = harness({
      turns: [
        {
          id: "resp_s",
          model: "muse-spark-1.3",
          call: null,
          usage,
          message: "Your Page shows 3 posts.",
        },
      ],
      run: { model: "muse-wonder-1.0" },
    });
    await handleAgentBrowser(request({ command: "step", runId }), deps);
    expect(finished[0]!.outcome).toMatchObject({ model: "muse-spark-1.3", status: "succeeded" });
    expect(finished[0]!.events[0]).toMatchObject({
      kind: "model",
      summary: expect.stringContaining("uses muse-spark-1.3"),
    });
  });
});
