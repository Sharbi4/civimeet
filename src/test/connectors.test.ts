// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { openConnectorSecret, sealConnectorSecret } from "@/lib/connector-crypto.server";
import { signInWithSavedLogin, loginPlaybooks } from "@/lib/connector-login.server";
import { oauthAuthorizeUrl } from "@/lib/connector-oauth.server";
import {
  handleConnectorCommand,
  handleConnectorOAuthCallback,
  type ConnectorDeps,
} from "@/lib/connector-runtime.server";
import {
  connectorCommandSchema,
  connectors,
  maskIdentifier,
  readCommentSettings,
} from "@/lib/connectors";
import type { SteelPage } from "@/lib/steel.server";

const org = "11111111-1111-4111-8111-111111111111";
const env = {
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  SUPABASE_URL: "https://db.example",
  STEEL_API_KEY: "steel",
};
const viewer = "https://api.steel.dev/v1/sessions/33333333-3333-4333-8333-333333333333/player";

describe("connector catalog", () => {
  it("masks logins so they can be recognized but not read", () => {
    expect(maskIdentifier("taylor@example.org")).toBe("ta•••@example.org");
    expect(maskIdentifier("(520) 555-0142")).toBe("•••0142");
    expect(maskIdentifier("communityhub")).toBe("com•••");
  });
  it("defaults comment safety to approval with a daily cap", () => {
    expect(readCommentSettings({})).toEqual({
      comment_mode: "approve_each",
      daily_comment_limit: 10,
      auto_pause: true,
    });
    expect(readCommentSettings({ daily_comment_limit: 99, comment_mode: "spam" })).toEqual({
      comment_mode: "approve_each",
      daily_comment_limit: 10,
      auto_pause: true,
    });
  });
  it("accepts only known, available connectors and strict credential shapes", () => {
    expect(
      connectorCommandSchema.safeParse({
        command: "browser_start",
        organizationId: org,
        connector: "facebook",
      }).success,
    ).toBe(true);
    expect(
      connectorCommandSchema.safeParse({
        command: "browser_start",
        organizationId: org,
        connector: "stripe",
      }).success,
    ).toBe(false);
    expect(
      connectorCommandSchema.safeParse({
        command: "browser_start",
        organizationId: org,
        connector: "myspace",
      }).success,
    ).toBe(false);
    expect(
      connectorCommandSchema.safeParse({
        command: "save_credentials",
        organizationId: org,
        connector: "facebook",
        credentials: { identifier: "a@b.co", password: "x", extra: 1 },
      }).success,
    ).toBe(false);
  });
  it("gives every saved-login platform a playbook and login page", () => {
    for (const connector of connectors.filter((item) => item.methods.includes("credentials"))) {
      expect(connector.loginUrl, connector.id).toMatch(/^https:\/\//);
      expect(loginPlaybooks[connector.id], connector.id).toBeDefined();
    }
  });
});

describe("connector encryption", () => {
  const scope = { organizationId: org, connector: "facebook" };
  it("round-trips without exposing the login in the stored value", async () => {
    const sealed = await sealConnectorSecret(
      { identifier: "taylor@example.org", password: "hunter2-secret" },
      scope,
      env,
    );
    expect(sealed).toMatch(/^v1\.svc\./);
    expect(sealed).not.toContain("hunter2");
    await expect(openConnectorSecret(sealed, scope, env)).resolves.toEqual({
      identifier: "taylor@example.org",
      password: "hunter2-secret",
    });
  });
  it("binds each value to its organization and connector", async () => {
    const sealed = await sealConnectorSecret({ password: "p" }, scope, env);
    await expect(
      openConnectorSecret(sealed, { organizationId: org, connector: "instagram" }, env),
    ).rejects.toThrow(/could not be unlocked/);
  });
  it("prefers a dedicated key when configured", async () => {
    const dedicated = { ...env, CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
    const sealed = await sealConnectorSecret({ password: "p" }, scope, dedicated);
    expect(sealed).toMatch(/^v1\.env\./);
    await expect(openConnectorSecret(sealed, scope, env)).rejects.toThrow();
    await expect(openConnectorSecret(sealed, scope, dedicated)).resolves.toEqual({ password: "p" });
  });
});

function fakePage(script: { afterSubmitUrl: string; challenge?: boolean }) {
  let url = "https://www.facebook.com/login/";
  let submitted = false;
  const typed: [string, string][] = [];
  const page = {
    navigate: vi.fn(async (next: string) => void (url = next)),
    waitFor: vi.fn(async () => true),
    fill: vi.fn(async (selector: string, value: string) => (typed.push([selector, value]), true)),
    click: vi.fn(async () => {
      submitted = true;
      url = script.afterSubmitUrl;
      return true;
    }),
    pressEnter: vi.fn(async () => {
      submitted = true;
      url = script.afterSubmitUrl;
    }),
    signInState: vi.fn(async () => ({
      url,
      passwordField: !submitted || /login/.test(url),
      challenge: Boolean(script.challenge && submitted),
    })),
  };
  return { page: page as unknown as SteelPage, typed, raw: page };
}

describe("saved-login sign-in", () => {
  it("types the login only into the platform's fields and reports success", async () => {
    const { page, typed } = fakePage({ afterSubmitUrl: "https://www.facebook.com/" });
    const outcome = await signInWithSavedLogin(
      page,
      "https://www.facebook.com/login/",
      loginPlaybooks["facebook"]!,
      { identifier: "a@b.co", password: "pw" },
    );
    expect(outcome.kind).toBe("signed_in");
    expect(typed).toEqual([
      ['input[name="email"]', "a@b.co"],
      ['input[name="pass"]', "pw"],
    ]);
  });
  it("hands security checks to the person", async () => {
    const { page } = fakePage({ afterSubmitUrl: "https://www.facebook.com/checkpoint/?next" });
    const outcome = await signInWithSavedLogin(
      page,
      "https://www.facebook.com/login/",
      loginPlaybooks["facebook"]!,
      { identifier: "a@b.co", password: "pw" },
    );
    expect(outcome.kind).toBe("challenge");
  });
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://civimeet.com/api/connectors", {
    method: "POST",
    headers: { Authorization: "Bearer session", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function deps(overrides: Partial<ConnectorDeps> = {}) {
  const finished: Record<string, unknown>[] = [];
  const stored: string[] = [];
  const base = {
    env,
    authorize: vi.fn(async () => "admin-1"),
    claim: vi.fn(async () => ({
      status: "not_connected",
      method: "browser",
      connectedAt: null,
      profileId: null,
      providerSession: null,
      humanActor: null,
      expiresAt: null,
      hasSecret: false,
    })),
    finish: vi.fn(
      async (_o: string, _c: string, _a: string, result: Record<string, unknown>) =>
        void finished.push(result),
    ),
    storeSecret: vi.fn(async (_o: string, _c: string, sealed: string) => void stored.push(sealed)),
    readSecret: vi.fn(async () => stored.at(-1) ?? null),
    forget: vi.fn(async () => "44444444-4444-4444-8444-444444444444"),
    beginOAuth: vi.fn(async () => {}),
    takeOAuth: vi.fn(),
    provider: {
      create: vi.fn(async (id: string) => ({
        id,
        profileId: "55555555-5555-4555-8555-555555555555",
        viewer,
      })),
      release: vi.fn(async () => {}),
      live: vi.fn(async () => ({ live: true, viewer })),
      deleteProfile: vi.fn(async () => {}),
    },
    page: vi.fn(),
    fetch: vi.fn(),
    newSessionId: () => "33333333-3333-4333-8333-333333333333",
  };
  return {
    deps: { ...base, ...overrides } as unknown as Partial<ConnectorDeps>,
    base,
    finished,
    stored,
  };
}

describe("connector commands", () => {
  it("requires a session and same-site requests", async () => {
    const { deps: d } = deps();
    expect(
      (
        await handleConnectorCommand(
          new Request("https://civimeet.com/api/connectors", { method: "POST" }),
          d,
        )
      ).status,
    ).toBe(401);
    expect(
      (await handleConnectorCommand(request({}, { Origin: "https://evil.example" }), d)).status,
    ).toBe(403);
  });
  it("lets only administrators manage connections", async () => {
    const { ConnectorError } = await import("@/lib/connector-runtime.server");
    const { deps: d, base } = deps({
      authorize: vi.fn(async () =>
        Promise.reject(
          new ConnectorError(
            403,
            "Only an organization owner or administrator can manage connections.",
          ),
        ),
      ),
    });
    const response = await handleConnectorCommand(
      request({ command: "browser_start", organizationId: org, connector: "facebook" }),
      d,
    );
    expect(response.status).toBe(403);
    expect(base.claim).not.toHaveBeenCalled();
  });
  it("opens a live sign-in browser on the platform's login page", async () => {
    const page = { navigate: vi.fn(async () => {}) };
    const { deps: d, finished } = deps({
      page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) =>
        work(page as unknown as SteelPage),
      ) as never,
    });
    const response = await handleConnectorCommand(
      request({ command: "browser_start", organizationId: org, connector: "facebook" }),
      d,
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "awaiting_sign_in", viewer });
    expect(page.navigate).toHaveBeenCalledWith("https://www.facebook.com/login/");
    expect(finished[0]).toMatchObject({
      status: "awaiting_sign_in",
      humanActor: "admin-1",
      event: "browser_sign_in_started",
    });
  });
  it("retries the first browser connection once before giving up", async () => {
    const page = { navigate: vi.fn(async () => {}) };
    let attempts = 0;
    const { deps: d } = deps({
      page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) => {
        attempts += 1;
        if (attempts === 1) throw new Error("Browser connection failed.");
        return work(page as unknown as SteelPage);
      }) as never,
    });
    const response = await handleConnectorCommand(
      request({ command: "browser_start", organizationId: org, connector: "facebook" }),
      d,
    );
    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
    expect(page.navigate).toHaveBeenCalledWith("https://www.facebook.com/login/");
  });
  it("closes a browser it couldn't hand over and says what went wrong", async () => {
    const {
      deps: d,
      base,
      finished,
    } = deps({
      page: vi.fn(async () => {
        throw new Error("Browser connection failed.");
      }) as never,
    });
    const response = await handleConnectorCommand(
      request({ command: "browser_start", organizationId: org, connector: "facebook" }),
      d,
    );
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error).toMatch(/couldn't load the sign-in page/);
    expect(base.provider.release).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
    expect(finished.at(-1)).toMatchObject({
      status: "not_connected",
      detail: "The agent browser could not open. Try again.",
    });
  });
  it("does not mark a connection live while the sign-in page is still showing", async () => {
    const page = {
      signInState: vi.fn(async () => ({
        url: "https://www.facebook.com/login/",
        passwordField: true,
        challenge: false,
      })),
    };
    const {
      deps: d,
      base,
      finished,
    } = deps({
      claim: vi.fn(async () => ({
        status: "awaiting_sign_in",
        method: "browser",
        connectedAt: null,
        profileId: null,
        providerSession: "33333333-3333-4333-8333-333333333333",
        humanActor: "admin-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        hasSecret: false,
      })) as never,
      page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) =>
        work(page as unknown as SteelPage),
      ) as never,
    });
    const body = await (
      await handleConnectorCommand(
        request({ command: "browser_finish", organizationId: org, connector: "facebook" }),
        d,
      )
    ).json();
    expect(body.status).toBe("awaiting_sign_in");
    expect(base.provider.release).not.toHaveBeenCalled();
    expect(finished.some((item) => item["status"] === "connected")).toBe(false);
  });
  it("saves an encrypted login, signs in and never echoes the password", async () => {
    const { page } = fakePage({ afterSubmitUrl: "https://www.facebook.com/" });
    const {
      deps: d,
      stored,
      finished,
      base,
    } = deps({
      page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) => work(page)) as never,
    });
    const response = await handleConnectorCommand(
      request({
        command: "save_credentials",
        organizationId: org,
        connector: "facebook",
        credentials: { identifier: "taylor@example.org", password: "hunter2-secret" },
      }),
      d,
    );
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "connected" });
    expect(text).not.toContain("hunter2");
    expect(stored[0]).not.toContain("hunter2");
    expect(JSON.stringify(finished)).not.toContain("hunter2");
    expect(finished.at(-1)).toMatchObject({
      status: "connected",
      method: "credentials",
      accountLabel: "ta•••@example.org",
    });
    expect(base.provider.release).toHaveBeenCalled();
  });
  it("keeps the browser open for a security check after a saved login", async () => {
    const { page } = fakePage({ afterSubmitUrl: "https://www.facebook.com/checkpoint/" });
    const { deps: d, finished } = deps({
      page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) => work(page)) as never,
    });
    const body = await (
      await handleConnectorCommand(
        request({
          command: "save_credentials",
          organizationId: org,
          connector: "facebook",
          credentials: { identifier: "a@b.co", password: "pw" },
        }),
        d,
      )
    ).json();
    expect(body).toMatchObject({ status: "needs_verification", viewer });
    expect(finished.at(-1)).toMatchObject({ status: "needs_verification", humanActor: "admin-1" });
  });
  it("disconnects by deleting the saved login and browser profile", async () => {
    const { deps: d, base, finished } = deps();
    const body = await (
      await handleConnectorCommand(
        request({ command: "disconnect", organizationId: org, connector: "facebook" }),
        d,
      )
    ).json();
    expect(body.status).toBe("not_connected");
    expect(base.forget).toHaveBeenCalledWith(org, "facebook");
    expect(base.provider.deleteProfile).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
    );
    expect(finished.at(-1)).toMatchObject({
      status: "not_connected",
      accountLabel: "",
      event: "disconnected",
    });
  });
  it("explains missing official sign-in setup instead of failing silently", async () => {
    const { deps: d } = deps();
    const response = await handleConnectorCommand(
      request({ command: "oauth_start", organizationId: org, connector: "google_calendar" }),
      d,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("GOOGLE_OAUTH_CLIENT_ID");
  });
  it("starts official sign-in with one-time state and PKCE", async () => {
    const { deps: d, base } = deps({
      env: { ...env, GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret" },
    });
    const body = await (
      await handleConnectorCommand(
        request({ command: "oauth_start", organizationId: org, connector: "google_calendar" }),
        d,
      )
    ).json();
    const url = new URL(body.redirect);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://civimeet.com/api/connectors/oauth/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_secret")).toBeNull();
    expect(base.beginOAuth).toHaveBeenCalledWith(
      "admin-1",
      org,
      "google_calendar",
      url.searchParams.get("state"),
      expect.any(String),
      "https://civimeet.com/api/connectors/oauth/callback",
    );
  });
});

describe("taking over a connected account", () => {
  it("opens the agent's signed-in browser without changing the connection status", async () => {
    const page = { navigate: vi.fn(async () => {}) };
    const {
      deps: d,
      finished,
      base,
    } = deps({
      claim: vi.fn(async () => ({
        status: "connected",
        method: "credentials",
        connectedAt: new Date().toISOString(),
        profileId: "55555555-5555-4555-8555-555555555555",
        providerSession: null,
        humanActor: null,
        expiresAt: null,
        hasSecret: true,
      })) as never,
      page: vi.fn(async (_id: string, work: (p: SteelPage) => unknown) =>
        work(page as unknown as SteelPage),
      ) as never,
    });
    const body = await (
      await handleConnectorCommand(
        request({ command: "browser_open", organizationId: org, connector: "facebook" }),
        d,
      )
    ).json();
    expect(body).toMatchObject({ status: "connected", viewer });
    expect(base.provider.create).toHaveBeenCalledWith(
      expect.any(String),
      true,
      "55555555-5555-4555-8555-555555555555",
    );
    expect(page.navigate).toHaveBeenCalledWith("https://www.facebook.com/");
    expect(finished.at(-1)).not.toHaveProperty("status");
    expect(finished.at(-1)).toMatchObject({ humanActor: "admin-1" });
  });
  it("refuses to open an account that is not connected", async () => {
    const { deps: d } = deps();
    const response = await handleConnectorCommand(
      request({ command: "browser_open", organizationId: org, connector: "facebook" }),
      d,
    );
    expect(response.status).toBe(409);
  });
});

describe("official sign-in return", () => {
  const callback = (query: string) =>
    new Request(`https://civimeet.com/api/connectors/oauth/callback?${query}`);
  const state = "s".repeat(43);
  it("rejects unknown or expired state", async () => {
    const { deps: d } = deps({
      takeOAuth: vi.fn(async () => Promise.reject(new Error("expired"))) as never,
    });
    const response = await handleConnectorOAuthCallback(callback(`state=${state}&code=abc`), d);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toContain("result=expired");
  });
  it("exchanges the code, seals the tokens and returns to Connections", async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) =>
      String(url).includes("token")
        ? Response.json({ access_token: "ya29.token", refresh_token: "refresh", expires_in: 3600 })
        : Response.json({ email: "events@example.org" }),
    );
    const {
      deps: d,
      stored,
      finished,
    } = deps({
      env: { ...env, GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret" },
      fetch: fetcher as never,
      takeOAuth: vi.fn(async () => ({
        organizationId: org,
        connector: "google_calendar",
        actor: "admin-1",
        verifier: "v".repeat(64),
        redirectUri: "https://civimeet.com/api/connectors/oauth/callback",
      })) as never,
    });
    const response = await handleConnectorOAuthCallback(callback(`state=${state}&code=abc`), d);
    expect(response.headers.get("Location")).toBe(
      "/dashboard?view=connectors&connector=google_calendar&result=connected",
    );
    expect(stored[0]).not.toContain("ya29");
    expect(finished.at(-1)).toMatchObject({
      status: "connected",
      method: "oauth",
      accountLabel: "events@example.org",
    });
    const tokenCall = fetcher.mock.calls.find(([url]) => String(url).includes("token"))!;
    expect(String((tokenCall[1] as RequestInit).body)).toContain("code_verifier=");
  });
  it("builds provider URLs without leaking the client secret", () => {
    const url = oauthAuthorizeUrl(
      "meta_pages",
      { state, redirectUri: "https://civimeet.com/cb", challenge: "c" },
      { META_APP_ID: "app", META_APP_SECRET: "secret" },
    );
    expect(url).toContain("pages_manage_posts");
    expect(url).not.toContain("secret");
  });
});
