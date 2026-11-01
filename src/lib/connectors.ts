import { z } from "zod";

export type ConnectMethod = "browser" | "credentials" | "oauth";
export type ConnectorCategory = "social" | "events" | "calendar" | "payments";
export type OAuthProvider =
  "google" | "zoom" | "meta_pages" | "meta_instagram" | "linkedin" | "eventbrite";
export type ConnectorStatus =
  | "not_connected"
  | "awaiting_sign_in"
  | "verifying"
  | "saved"
  | "connected"
  | "needs_verification"
  | "needs_attention";

export type CredentialField = {
  key: "identifier" | "password" | "handle";
  label: string;
  type: "text" | "password";
  autoComplete: string;
  optional?: boolean;
  hint?: string;
};

export type ConnectorDefinition = {
  id: string;
  name: string;
  category: ConnectorCategory;
  summary: string;
  /** What the agent does once this connection is live. */
  agentWork: string[];
  methods: ConnectMethod[];
  oauth?: { provider: OAuthProvider; label: string };
  loginUrl?: string;
  fields?: CredentialField[];
  /** Platforms where the agent comments in the community get comment-safety controls. */
  commentControls?: boolean;
  risk?: string;
  comingSoon?: boolean;
};

const password: CredentialField = {
  key: "password",
  label: "Password",
  type: "password",
  autoComplete: "current-password",
};
const automationRisk =
  "Facebook, Instagram and similar platforms restrict automated activity. CiviMeet paces the agent, caps daily comments and pauses at the first warning, but platform checks remain possible.";

export const connectors: ConnectorDefinition[] = [
  {
    id: "facebook",
    name: "Facebook",
    category: "social",
    summary: "Groups, community comments, events and messages through your own account.",
    agentWork: [
      "Joins and takes part in local groups",
      "Comments with helpful local tips",
      "Creates events and invites people",
      "Messages vendors when they have no email or phone",
    ],
    methods: ["browser", "credentials"],
    loginUrl: "https://www.facebook.com/login/",
    fields: [
      {
        key: "identifier",
        label: "Email or mobile number",
        type: "text",
        autoComplete: "username",
      },
      password,
    ],
    commentControls: true,
    risk: automationRisk,
  },
  {
    id: "facebook_page",
    name: "Facebook Page",
    category: "social",
    summary: "The official Pages connection for your organization’s Page.",
    agentWork: [
      "Publishes posts to your Page",
      "Replies to comments on your posts",
      "Answers people who message your Page",
      "Reads Page reach and engagement",
    ],
    methods: ["oauth"],
    oauth: { provider: "meta_pages", label: "Continue with Facebook" },
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "social",
    summary: "Posts, stories, comments and messages for your community account.",
    agentWork: [
      "Shares event posts and stories",
      "Replies to comments and messages",
      "Engages with local accounts and hashtags",
    ],
    methods: ["browser", "credentials", "oauth"],
    oauth: { provider: "meta_instagram", label: "Continue with Instagram (business)" },
    loginUrl: "https://www.instagram.com/accounts/login/",
    fields: [
      {
        key: "identifier",
        label: "Username, email or mobile number",
        type: "text",
        autoComplete: "username",
      },
      password,
    ],
    commentControls: true,
    risk: automationRisk,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    summary: "Professional partners, sponsors and civic leaders.",
    agentWork: [
      "Posts updates and event announcements",
      "Comments on partner and sponsor posts",
      "Reaches out to local organizations",
    ],
    methods: ["browser", "credentials", "oauth"],
    oauth: { provider: "linkedin", label: "Continue with LinkedIn" },
    loginUrl: "https://www.linkedin.com/login",
    fields: [
      { key: "identifier", label: "Email or phone", type: "text", autoComplete: "username" },
      password,
    ],
    commentControls: true,
  },
  {
    id: "x",
    name: "X",
    category: "social",
    summary: "Real-time local conversation and announcements.",
    agentWork: ["Posts announcements", "Replies in local conversations", "Follows local voices"],
    methods: ["browser", "credentials"],
    loginUrl: "https://x.com/i/flow/login",
    fields: [
      {
        key: "identifier",
        label: "Phone, email or username",
        type: "text",
        autoComplete: "username",
      },
      password,
      {
        key: "handle",
        label: "@handle",
        type: "text",
        autoComplete: "off",
        optional: true,
        hint: "X sometimes asks to confirm your handle when you sign in from a new browser.",
      },
    ],
    commentControls: true,
  },
  {
    id: "nextdoor",
    name: "Nextdoor",
    category: "social",
    summary: "Neighborhood feeds where residents ask for help and recommendations.",
    agentWork: [
      "Answers neighbors’ questions",
      "Shares local events",
      "Finds recommended local vendors",
    ],
    methods: ["browser", "credentials"],
    loginUrl: "https://nextdoor.com/login/",
    fields: [
      { key: "identifier", label: "Email or phone number", type: "text", autoComplete: "username" },
      password,
    ],
    commentControls: true,
  },
  {
    id: "reddit",
    name: "Reddit",
    category: "social",
    summary: "City and neighborhood subreddits.",
    agentWork: ["Answers questions in local subreddits", "Shares useful resources"],
    methods: ["browser", "credentials"],
    loginUrl: "https://www.reddit.com/login/",
    fields: [
      { key: "identifier", label: "Username or email", type: "text", autoComplete: "username" },
      password,
    ],
    commentControls: true,
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "social",
    summary: "Short video for younger neighbors.",
    agentWork: ["Posts event recaps", "Replies to comments"],
    methods: ["browser"],
    loginUrl: "https://www.tiktok.com/login",
    commentControls: true,
  },
  {
    id: "eventbrite",
    name: "Eventbrite",
    category: "events",
    summary: "Ticketing, RSVPs and event discovery.",
    agentWork: ["Publishes event listings", "Tracks RSVPs and check-ins", "Emails attendees"],
    methods: ["oauth", "browser", "credentials"],
    oauth: { provider: "eventbrite", label: "Continue with Eventbrite" },
    loginUrl: "https://www.eventbrite.com/signin/",
    fields: [
      { key: "identifier", label: "Email address", type: "text", autoComplete: "username" },
      password,
    ],
  },
  {
    id: "meetup",
    name: "Meetup",
    category: "events",
    summary: "Recurring groups and local meetups.",
    agentWork: ["Creates meetup events", "Messages group members", "Tracks RSVPs"],
    methods: ["browser", "credentials"],
    loginUrl: "https://www.meetup.com/login/",
    fields: [
      { key: "identifier", label: "Email address", type: "text", autoComplete: "username" },
      password,
    ],
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "events",
    summary: "Virtual events and meetings.",
    agentWork: ["Creates meeting links for virtual events", "Sends join details to attendees"],
    methods: ["oauth"],
    oauth: { provider: "zoom", label: "Continue with Zoom" },
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "calendar",
    summary: "Calendar holds and invitations for every event.",
    agentWork: ["Adds events to your calendar", "Sends calendar invites", "Checks for conflicts"],
    methods: ["oauth"],
    oauth: { provider: "google", label: "Continue with Google" },
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    summary: "Pay vendors within the monthly budget you set.",
    agentWork: ["Pays approved vendor quotes", "Tracks spend against your budget"],
    methods: [],
    comingSoon: true,
  },
  {
    id: "plaid",
    name: "Plaid",
    category: "payments",
    summary: "Link a bank account for vendor payments.",
    agentWork: ["Links your organization’s bank account", "Verifies payment balances"],
    methods: [],
    comingSoon: true,
  },
];

export const connectorCategories: { id: ConnectorCategory; label: string; blurb: string }[] = [
  {
    id: "social",
    label: "Community presence",
    blurb: "Where your agent shows up and talks with people.",
  },
  {
    id: "events",
    label: "Events & meetings",
    blurb: "Where gatherings get listed, ticketed and hosted.",
  },
  { id: "calendar", label: "Calendar", blurb: "Holds and invitations for every event." },
  { id: "payments", label: "Payments", blurb: "Paying vendors within your monthly budget." },
];

/** Server secret names each official sign-in needs (names only, never values). */
export const oauthEnvNames: Record<OAuthProvider, string> = {
  google: "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET",
  zoom: "ZOOM_OAUTH_CLIENT_ID and ZOOM_OAUTH_CLIENT_SECRET",
  meta_pages: "META_APP_ID and META_APP_SECRET",
  meta_instagram: "META_APP_ID and META_APP_SECRET",
  linkedin: "LINKEDIN_OAUTH_CLIENT_ID and LINKEDIN_OAUTH_CLIENT_SECRET",
  eventbrite: "EVENTBRITE_OAUTH_CLIENT_ID and EVENTBRITE_OAUTH_CLIENT_SECRET",
};

export const methodLabels: Record<ConnectMethod, string> = {
  browser: "Sign in live",
  credentials: "Save login",
  oauth: "Official sign-in",
};

export const statusCopy: Record<
  ConnectorStatus,
  { label: string; tone: "idle" | "live" | "good" | "warn" }
> = {
  not_connected: { label: "Not connected", tone: "idle" },
  awaiting_sign_in: { label: "Waiting for you to sign in", tone: "live" },
  verifying: { label: "Agent is signing in", tone: "live" },
  saved: { label: "Login saved", tone: "warn" },
  connected: { label: "Connected", tone: "good" },
  needs_verification: { label: "Needs a security check", tone: "warn" },
  needs_attention: { label: "Needs attention", tone: "warn" },
};

export function getConnector(id: string) {
  return connectors.find((connector) => connector.id === id);
}

/** Show enough of a login to recognize it without exposing it. */
export function maskIdentifier(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  const at = value.indexOf("@");
  if (at > 0) {
    const name = value.slice(0, at);
    return `${name.slice(0, Math.min(2, name.length))}•••${value.slice(at)}`.slice(0, 160);
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 7 && digits.length === value.replace(/[\s()+.-]/g, "").length)
    return `•••${digits.slice(-4)}`;
  return `${value.slice(0, Math.min(3, value.length))}•••`.slice(0, 160);
}

export type CommentSettings = {
  comment_mode: "approve_each" | "autopilot";
  daily_comment_limit: number;
  auto_pause: boolean;
};
export const defaultCommentSettings: CommentSettings = {
  comment_mode: "approve_each",
  daily_comment_limit: 10,
  auto_pause: true,
};
export const autopilotTrustDays = 14;
export function readCommentSettings(raw: unknown): CommentSettings {
  const parsed = z
    .object({
      comment_mode: z.enum(["approve_each", "autopilot"]).catch("approve_each"),
      daily_comment_limit: z.number().int().min(1).max(15).catch(10),
      auto_pause: z.boolean().catch(true),
    })
    .partial()
    .safeParse(raw ?? {});
  const value = parsed.success ? parsed.data : {};
  return {
    comment_mode: value.comment_mode ?? defaultCommentSettings.comment_mode,
    daily_comment_limit: value.daily_comment_limit ?? defaultCommentSettings.daily_comment_limit,
    auto_pause: value.auto_pause ?? defaultCommentSettings.auto_pause,
  };
}
export function autopilotUnlocksAt(connectedAt: string | null) {
  if (!connectedAt) return null;
  return new Date(Date.parse(connectedAt) + autopilotTrustDays * 86_400_000);
}

const connectorId = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,39}$/)
  .refine((id) => Boolean(getConnector(id) && !getConnector(id)!.comingSoon), "Unknown connector");
export const connectorCommandSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.enum([
        "browser_start",
        "browser_observe",
        "browser_finish",
        "browser_cancel",
        "verify",
        "disconnect",
        "oauth_start",
      ]),
      organizationId: z.string().uuid(),
      connector: connectorId,
    })
    .strict(),
  z
    .object({
      command: z.literal("save_credentials"),
      organizationId: z.string().uuid(),
      connector: connectorId,
      credentials: z
        .object({
          identifier: z.string().trim().min(3).max(320),
          password: z.string().min(1).max(512),
          handle: z.string().trim().max(60).optional(),
        })
        .strict(),
    })
    .strict(),
]);
export type ConnectorCommand = z.infer<typeof connectorCommandSchema>;

export type ConnectorRow = {
  connector: string;
  method: ConnectMethod;
  status: ConnectorStatus;
  account_label: string;
  detail: string;
  settings: Record<string, unknown>;
  connected_at: string | null;
  last_checked_at: string | null;
  updated_at: string;
};
export type ConnectorEvent = {
  id: string;
  connector: string;
  action: string;
  message: string;
  created_at: string;
};
