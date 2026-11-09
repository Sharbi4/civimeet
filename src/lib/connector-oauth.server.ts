import "@tanstack/react-start/server-only";
import type { OAuthProvider } from "./connectors";

type Env = Record<string, string | undefined>;
export type OAuthTokens = {
  provider: OAuthProvider;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
};
type ProviderConfig = {
  label: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: (env: Env) => string;
  tokenUrl: (env: Env) => string;
  scope: string;
  pkce: boolean;
  tokenAuth: "body" | "basic";
  extraParams?: Record<string, string>;
  /** A short, recognizable label for the connected account. */
  account: (accessToken: string, env: Env, request: typeof fetch) => Promise<string>;
};

const graph = (env: Env) => env["META_GRAPH_VERSION"] || "v23.0";
async function getJson(request: typeof fetch, url: string, accessToken: string) {
  const response = await request(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("The platform did not return the connected account.");
  return (await response.json()) as Record<string, unknown>;
}
const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 120) : "");

export const oauthProviders: Record<OAuthProvider, ProviderConfig> = {
  google: {
    label: "Google",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    authorizeUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    scope: "openid email https://www.googleapis.com/auth/calendar.events",
    pkce: true,
    tokenAuth: "body",
    extraParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    account: async (token, _env, request) =>
      text(
        (await getJson(request, "https://openidconnect.googleapis.com/v1/userinfo", token))[
          "email"
        ],
      ),
  },
  zoom: {
    label: "Zoom",
    clientIdEnv: "ZOOM_OAUTH_CLIENT_ID",
    clientSecretEnv: "ZOOM_OAUTH_CLIENT_SECRET",
    authorizeUrl: () => "https://zoom.us/oauth/authorize",
    tokenUrl: () => "https://zoom.us/oauth/token",
    scope: "",
    pkce: true,
    tokenAuth: "basic",
    account: async (token, _env, request) =>
      text((await getJson(request, "https://api.zoom.us/v2/users/me", token))["email"]),
  },
  meta_pages: {
    label: "Facebook",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    authorizeUrl: (env) => `https://www.facebook.com/${graph(env)}/dialog/oauth`,
    tokenUrl: (env) => `https://graph.facebook.com/${graph(env)}/oauth/access_token`,
    scope:
      "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,pages_messaging",
    pkce: false,
    tokenAuth: "body",
    account: async (token, env, request) => {
      const pages = await getJson(
        request,
        `https://graph.facebook.com/${graph(env)}/me/accounts?fields=name&limit=25`,
        token,
      );
      const names = Array.isArray(pages["data"])
        ? (pages["data"] as { name?: string }[]).map((page) => page.name).filter(Boolean)
        : [];
      if (!names.length) return "No Pages shared";
      return names.length === 1 ? text(names[0]) : `${text(names[0])} + ${names.length - 1} more`;
    },
  },
  meta_instagram: {
    label: "Instagram",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    authorizeUrl: (env) => `https://www.facebook.com/${graph(env)}/dialog/oauth`,
    tokenUrl: (env) => `https://graph.facebook.com/${graph(env)}/oauth/access_token`,
    scope:
      "instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_messages,pages_show_list,pages_read_engagement",
    pkce: false,
    tokenAuth: "body",
    account: async (token, env, request) => {
      const pages = await getJson(
        request,
        `https://graph.facebook.com/${graph(env)}/me/accounts?fields=instagram_business_account{username}&limit=25`,
        token,
      );
      const rows = Array.isArray(pages["data"])
        ? (pages["data"] as { instagram_business_account?: { username?: string } }[])
        : [];
      const handle = rows.map((row) => row.instagram_business_account?.username).find(Boolean);
      return handle ? `@${text(handle)}` : "No business account linked";
    },
  },
  linkedin: {
    label: "LinkedIn",
    clientIdEnv: "LINKEDIN_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_OAUTH_CLIENT_SECRET",
    authorizeUrl: () => "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: () => "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile email w_member_social",
    pkce: false,
    tokenAuth: "body",
    account: async (token, _env, request) => {
      const profile = await getJson(request, "https://api.linkedin.com/v2/userinfo", token);
      return text(profile["email"]) || text(profile["name"]);
    },
  },
  eventbrite: {
    label: "Eventbrite",
    clientIdEnv: "EVENTBRITE_OAUTH_CLIENT_ID",
    clientSecretEnv: "EVENTBRITE_OAUTH_CLIENT_SECRET",
    authorizeUrl: () => "https://www.eventbrite.com/oauth/authorize",
    tokenUrl: () => "https://www.eventbrite.com/oauth/token",
    scope: "",
    pkce: false,
    tokenAuth: "body",
    account: async (token, _env, request) => {
      const me = await getJson(request, "https://www.eventbriteapi.com/v3/users/me/", token);
      const emails = Array.isArray(me["emails"]) ? (me["emails"] as { email?: string }[]) : [];
      return text(emails[0]?.email) || text(me["name"]);
    },
  },
};

export function oauthConfigured(provider: OAuthProvider, env: Env = process.env) {
  const config = oauthProviders[provider];
  return Boolean(env[config.clientIdEnv] && env[config.clientSecretEnv]);
}

export function oauthAuthorizeUrl(
  provider: OAuthProvider,
  input: { state: string; redirectUri: string; challenge: string },
  env: Env = process.env,
) {
  const config = oauthProviders[provider];
  const url = new URL(config.authorizeUrl(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env[config.clientIdEnv]!.trim());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  if (config.scope) url.searchParams.set("scope", config.scope);
  if (config.pkce) {
    url.searchParams.set("code_challenge", input.challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [name, value] of Object.entries(config.extraParams ?? {}))
    url.searchParams.set(name, value);
  return url.href;
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  input: { code: string; redirectUri: string; verifier: string },
  env: Env = process.env,
  request: typeof fetch = fetch,
): Promise<{ tokens: OAuthTokens; account: string }> {
  const config = oauthProviders[provider];
  const clientId = env[config.clientIdEnv]!.trim();
  const clientSecret = env[config.clientSecretEnv]!.trim();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  if (config.pkce) body.set("code_verifier", input.verifier);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.tokenAuth === "basic")
    headers["Authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  const response = await request(config.tokenUrl(env), {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`${config.label} did not accept the sign-in. Try again.`);
  const raw = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof raw["access_token"] === "string" ? raw["access_token"] : "";
  if (!accessToken) throw new Error(`${config.label} did not return an access token.`);
  const expiresIn =
    typeof raw["expires_in"] === "number" ? raw["expires_in"] : Number(raw["expires_in"]);
  const tokens: OAuthTokens = {
    provider,
    access_token: accessToken,
    ...(typeof raw["refresh_token"] === "string" ? { refresh_token: raw["refresh_token"] } : {}),
    ...(Number.isFinite(expiresIn) && expiresIn > 0
      ? { expires_at: new Date(Date.now() + expiresIn * 1000).toISOString() }
      : {}),
    ...(typeof raw["scope"] === "string" ? { scope: raw["scope"] } : {}),
  };
  let account = "";
  try {
    account = await config.account(accessToken, env, request);
  } catch {
    account = `${config.label} account`;
  }
  return { tokens, account: account || `${config.label} account` };
}
