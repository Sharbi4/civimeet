import { z } from "zod";

export const browserStates = [
  "not_connected",
  "connecting",
  "authentication_required",
  "waiting_for_human",
  "human_controlling",
  "ready",
  "agent_working",
  "waiting_for_approval",
  "paused",
  "completed",
  "session_expired",
  "failed",
] as const;
export type BrowserState = (typeof browserStates)[number];
export const browserStateLabel = (state: BrowserState) => state.replaceAll("_", " ");
export const browserCommandSchema = z
  .object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    requestId: z.string().uuid(),
    command: z.enum([
      "start",
      "observe",
      "pause",
      "takeover",
      "resume",
      "disconnect",
      "navigate",
      "scroll",
    ]),
    url: z.string().url().max(2048).optional(),
    task: z.string().trim().max(500).default("Review a permitted community resource"),
  })
  .strict();
export type BrowserCommand = z.infer<typeof browserCommandSchema>;
export type BrowserWorkspace = {
  id: string;
  organization_id: string;
  agent_id: string;
  state: BrowserState;
  current_origin: string;
  task: string;
  expires_at: string | null;
  updated_at: string;
  human_actor: string | null;
};

// URLs remain untrusted input even when they came from a model or research citation.
export function approvedBrowserUrl(raw: string, origins: string[]): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || !origins.includes(url.origin))
    throw new Error("This website is not enabled for browser work.");
  const unsupported = [
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "nextdoor.com",
    "eventbrite.com",
    "x.com",
    "twitter.com",
  ];
  if (unsupported.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))
    throw new Error("Browser automation for this platform is not enabled.");
  if (
    /localhost|\.local$|\.internal$/.test(url.hostname) ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(":")
  )
    throw new Error("Use an approved public website.");
  if (url.search || url.hash)
    throw new Error("Use a page address without query parameters or fragments.");
  return url.href;
}

export class UnexpectedViewerError extends Error {
  constructor() {
    super("Steel returned a browser viewer address Civi doesn't recognize, so it wasn't shown.");
  }
}
/**
 * Steel's interactive viewer: https://api.steel.dev/v1/sessions/{id}/player, followed (for
 * interactive sessions) by one opaque access segment. Only this exact shape is ever framed, and
 * when the session is known the address must belong to that session.
 */
export function safeSteelViewer(raw: string, sessionId?: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnexpectedViewerError();
  }
  const match = /^\/v1\/sessions\/([a-f0-9-]{8,64})\/player(?:\/[A-Za-z0-9._~-]{1,1024})?$/.exec(
    url.pathname,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.steel.dev" ||
    url.port ||
    !match ||
    (sessionId !== undefined && match[1] !== sessionId.toLowerCase()) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new UnexpectedViewerError();
  return url.href;
}
