import { z } from "zod";

// Intent-to-action routing for Organizer Chat. Instructions that a tool can carry out are
// recognized here and run directly through the app's authorized APIs; everything else goes to
// Civi's conversation (which can also request a tool with a <civi_action> line).
export type ChatIntent =
  | { type: "connect_platform"; platform: string; goal?: string | undefined }
  | { type: "browse_task"; platform: string; objective: string }
  | { type: "open_browser"; platform?: string | undefined }
  | { type: "show_agent"; platform: string }
  | { type: "pause_agent"; platform: string; resume: boolean }
  | { type: "show_approvals" }
  | { type: "show_connections" };

export const chatIntentSchema: z.ZodType<ChatIntent> = z.union([
  z.object({
    type: z.literal("connect_platform"),
    platform: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
    goal: z.string().trim().max(1000).optional(),
  }),
  z.object({
    type: z.literal("browse_task"),
    platform: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
    objective: z.string().trim().min(3).max(1000),
  }),
  z.object({
    type: z.literal("open_browser"),
    platform: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,39}$/)
      .optional(),
  }),
  z.object({ type: z.literal("show_agent"), platform: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/) }),
  z.object({
    type: z.literal("pause_agent"),
    platform: z.string().regex(/^(all|[a-z][a-z0-9_]{1,39})$/),
    resume: z.boolean(),
  }),
  z.object({ type: z.literal("show_approvals") }),
  z.object({ type: z.literal("show_connections") }),
]);

/** Names people use for each platform, most specific first. */
const platformNames: [string, string][] = [
  ["facebook_page", String.raw`facebook\s+page|fb\s+page`],
  ["google_calendar", String.raw`google\s+calendar|gcal|my\s+calendar|the\s+calendar`],
  ["facebook", String.raw`facebook|fb`],
  ["instagram", String.raw`instagram|insta|ig`],
  ["linkedin", String.raw`linked\s?in`],
  ["x", String.raw`twitter|x\.com|(?<=\b(?:my|on|to|into|open|the)\s)x(?=\b)`],
  ["nextdoor", String.raw`next\s?door`],
  ["reddit", String.raw`reddit`],
  ["tiktok", String.raw`tik\s?tok`],
  ["eventbrite", String.raw`eventbrite`],
  ["meetup", String.raw`meetup(?:\.com)?`],
  ["zoom", String.raw`zoom`],
];
const platformPattern = platformNames.map(([, pattern]) => `(?:${pattern})`).join("|");

export function findPlatform(text: string): string | undefined {
  for (const [id, pattern] of platformNames)
    if (new RegExp(`\\b(?:${pattern})\\b`, "i").test(text)) return id;
  return undefined;
}

const objectWords = String.raw`group|groups|page|pages|event|events|post|posts|community|communities|ad|ads|campaign|account\s+for|presence|strategy`;
const connectVerb = new RegExp(
  String.raw`\b(?:connect|reconnect|link|log\s?(?:me\s)?in(?:to)?|login|sign\s?(?:me\s)?in(?:to)?|authenticate|authori[sz]e|hook\s+up)\b[^.?!]{0,30}?\b(?:${platformPattern})\b`,
  "i",
);
const openVerb = new RegExp(
  String.raw`\b(?:open|launch|start|pull\s+up|bring\s+up|go\s+to|take\s+me\s+to|get\s+(?:me\s+)?into)\s+(?:up\s+)?(?:my\s+|the\s+|our\s+)?(?:${platformPattern})\b(?!\s+(?:${objectWords})\b)`,
  "i",
);
const browserWords = /\b(?:browser|steel)\b/i;
const openBrowser = /\b(?:open|start|launch|show|pull\s+up|bring\s+up)\b[^.?!]{0,30}\bbrowser\b/i;
const showAgent =
  /\b(?:what(?:'s|\s+is)|show(?:\s+me)?|check(?:\s+on)?|how(?:'s|\s+is))\b[^.?!]{0,40}\b(?:agent|doing|working\s+on|up\s+to)\b/i;
const pauseWords = /\b(?:pause|stop|halt|freeze|turn\s+off)\b/i;
const resumeWords = /\b(?:resume|unpause|restart|turn\s+(?:back\s+)?on|start\s+(?:it\s+)?again)\b/i;
const approvalsWords =
  /\b(?:approvals?|pending\s+(?:items|drafts|posts)|waiting\s+(?:for|on)\s+(?:me|my|approval|review)|needs?\s+(?:my\s+)?(?:approval|review)|review\s+queue)\b/i;
const showWords =
  /\b(?:show|open|list|see|view|what|any|check|pull\s+up|bring\s+up|go\s+to|take\s+me\s+to)\b/i;
const connectionsWords =
  /\b(?:connections|connectors|connected\s+accounts|my\s+accounts|integrations)\b/i;

const browseVerb =
  /\b(?:show(?:\s+me)?|go\s+to|take\s+me\s+to|check(?:\s+on)?|look\s+at|open|pull\s+up|browse|see|review|what(?:'s|\s+is)\s+(?:on|new\s+on|happening\s+on))\b/i;
const browseObject =
  /\b(?:our|my|the|this)\s+(?:[\w.-]+\s+){0,2}?(?:page|profile|feed|groups?|notifications?|inbox|messages|events?|timeline|posts|insights|followers|mentions|account|home)\b/i;

/** What else the person wants once the action is done ("…and find local groups"). */
function remainingGoal(message: string) {
  const parts = message
    .split(/\b(?:and\s+then|then|so\s+(?:that\s+)?(?:we|you|i)\s+can|and)\b|[.;]/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const leftover = parts.filter(
    (part) =>
      !connectVerb.test(part) &&
      !openVerb.test(part) &&
      !browserWords.test(part) &&
      !/\b(?:log\s?in|login|sign\s?in|let\s+me|take\s+over|verify|two[-\s]?factor|2fa|password)\b/i.test(
        part,
      ) &&
      part.split(/\s+/).length >= 2,
  );
  const goal = leftover
    .join(" and ")
    .replace(/^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?/i, "")
    .trim();
  return goal.length >= 6 ? goal.slice(0, 1000) : undefined;
}

/** Recognize an instruction a tool can carry out. Returns null for conversation and research. */
export function parseChatIntent(raw: string): ChatIntent | null {
  const message = raw.trim();
  if (!message || message.length > 600) return null;
  const platform = findPlatform(message);

  if (approvalsWords.test(message) && showWords.test(message) && !pauseWords.test(message))
    return { type: "show_approvals" };
  if (connectionsWords.test(message) && showWords.test(message) && !platform)
    return { type: "show_connections" };

  if (
    platform &&
    (pauseWords.test(message) || resumeWords.test(message)) &&
    /\bagent\b/i.test(message)
  )
    return {
      type: "pause_agent",
      platform,
      resume: resumeWords.test(message) && !pauseWords.test(message),
    };
  if (
    !platform &&
    /\b(?:all|every|the)\s+agents?\b|\beverything\b/i.test(message) &&
    (pauseWords.test(message) || resumeWords.test(message))
  )
    return {
      type: "pause_agent",
      platform: "all",
      resume: resumeWords.test(message) && !pauseWords.test(message),
    };

  if (platform && showAgent.test(message) && !connectVerb.test(message))
    return { type: "show_agent", platform };

  // "Show me our Facebook Page": a read-only look inside the connected account.
  if (
    platform &&
    !connectVerb.test(message) &&
    browseVerb.test(message) &&
    browseObject.test(message) &&
    !/\bagent\b/i.test(message)
  )
    return {
      type: "browse_task",
      platform: platform === "facebook_page" ? "facebook" : platform,
      objective: message.slice(0, 1000),
    };

  if (
    platform &&
    (connectVerb.test(message) ||
      openVerb.test(message) ||
      (browserWords.test(message) && /\b(?:open|start|launch|use)\b/i.test(message)))
  )
    return { type: "connect_platform", platform, goal: remainingGoal(message) };

  if (openBrowser.test(message)) return { type: "open_browser", ...(platform ? { platform } : {}) };
  return null;
}

/** Pull a tool request out of a conversational reply. The line is never shown to people. */
export function extractChatAction(answer: string): { answer: string; action?: ChatIntent } {
  const pattern = /<civi_action>\s*([\s\S]*?)\s*<\/civi_action>/gi;
  const last = [...answer.matchAll(pattern)].at(-1)?.[1];
  const cleaned = answer.replace(pattern, "").trim();
  if (!last) return { answer: cleaned };
  try {
    const parsed = chatIntentSchema.safeParse(JSON.parse(last));
    return parsed.success ? { answer: cleaned, action: parsed.data } : { answer: cleaned };
  } catch {
    return { answer: cleaned };
  }
}

/** The tools Civi can use from chat, told to the model so it never claims it can't. */
export const toolManifest = [
  "TOOLS YOU CAN USE FROM THIS CHAT (the app carries them out; never say you can't open a browser, log in or connect an account):",
  "connect_platform: open a platform in the organization's secure agent browser so the team can sign in themselves (two-factor included), or open the already-connected account; official sign-in for Google Calendar, Zoom and Facebook Pages. You never see or ask for passwords.",
  'browse_task: have the platform agent look inside the connected account in its secure browser (read-only: it navigates and reports what it sees, and never posts or changes anything), e.g. {"type":"browse_task","platform":"facebook","objective":"Show our Facebook Page and summarize recent posts"}.',
  "open_browser: show the agent's browser in the panel. show_agent: open a platform agent's chat and activity. pause_agent: pause or resume a platform agent (platform 'all' for every plan). show_approvals: open what's waiting for approval. show_connections: open Connections.",
  'When the team asks for one of these, reply in one short sentence saying what you\'re doing and end with one line like <civi_action>{"type":"connect_platform","platform":"facebook","goal":"find local groups"}</civi_action>. Use only those types; platform ids: facebook, facebook_page, instagram, linkedin, x, nextdoor, reddit, tiktok, eventbrite, meetup, zoom, google_calendar. Never claim the action already succeeded; the app reports the real result. Never ask anyone to type a password into chat.',
].join(" ");
