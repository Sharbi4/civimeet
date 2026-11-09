import type { ResearchResult } from "./research";
export const organizerThreads = ["main", "venue", "outreach", "volunteers"] as const;
export type OrganizerThread = (typeof organizerThreads)[number];
export const threadLabels: Record<OrganizerThread, string> = {
  main: "Civi",
  venue: "Venue Research",
  outreach: "Outreach",
  volunteers: "Volunteers",
};
export const threadPrompts: Record<OrganizerThread, string> = {
  main: "Help us plan a neighborhood resource fair. Start with local needs, partners, and a practical checklist.",
  venue:
    "Compare accessible local community venues for 200 people. Cite sources and mark unconfirmed capacity and pricing.",
  outreach: "Draft a welcoming invitation for our community event. Do not send or publish it.",
  volunteers:
    "Prepare volunteer roles, an opt-in sign-up plan, and a briefing checklist for our event.",
};
/** Each connected platform gets its own agent conversation, keyed by connector id. */
export type PlatformThread = `platform_${string}`;
export type ChatThread = OrganizerThread | PlatformThread;
export const platformThread = (connector: string): PlatformThread => `platform_${connector}`;
export const isPlatformThread = (thread: string): thread is PlatformThread =>
  thread.startsWith("platform_");
export function chatLabel(thread: ChatThread | "discover", platformName?: string) {
  if (thread === "discover") return "Research your community";
  if (isPlatformThread(thread)) return `${platformName ?? "Platform"} Agent`;
  return threadLabels[thread];
}
export function chatPrompt(thread: ChatThread, platformName?: string) {
  if (isPlatformThread(thread))
    return `What should our ${platformName ?? "platform"} agent contribute this week? Suggest helpful posts, comments and groups to join, and draft the first one for review.`;
  return threadPrompts[thread];
}
export type OrganizerTurn = {
  id: string;
  input: { question: string; threadKey?: string; location?: string; eventId?: string };
  status: string;
  result: ResearchResult | null;
  error: string | null;
  created_at: string;
};
export type ReviewItem = {
  id: string;
  title: string;
  content: string;
  destination: string;
  kind: string;
  status: string;
  revision: number;
  reviewed_at?: string;
  reviewed_by?: string;
};
