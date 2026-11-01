import type { ResearchResult } from "./research";
export const organizerThreads = ["main", "venue", "outreach", "volunteers"] as const;
export type OrganizerThread = (typeof organizerThreads)[number];
export const threadLabels: Record<OrganizerThread, string> = {
  main: "Main Organizer Chat",
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
export type OrganizerTurn = {
  id: string;
  input: { question: string; threadKey?: OrganizerThread };
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
export const demoApprovals: ReviewItem[] = [
  {
    id: "sample-post",
    title: "Facebook Group draft post",
    content:
      "Neighbors, we’re planning a Neighborhood Resource Fair in Tucson next month. What resources would be most useful to you? We’d love your input before finalizing the plan.",
    destination: "Tucson Community Alliance · sample Facebook Group",
    kind: "post",
    status: "pending",
    revision: 1,
  },
  {
    id: "sample-venue",
    title: "Reid Park Community Center hold",
    content:
      "Request an accessible space for the proposed resource fair. Date, capacity, availability, and price require confirmation. No reservation has been made.",
    destination: "Reid Park Community Center · illustrative request",
    kind: "booking",
    status: "pending",
    revision: 1,
  },
  {
    id: "sample-deposit",
    title: "$250 food truck deposit",
    content:
      "Proposed deposit: $250 USD. Vendor, quote, refund terms, and payment account must be verified before any payment. This sample never moves money.",
    destination: "Sample food truck · no payment account connected",
    kind: "payment",
    status: "pending",
    revision: 1,
  },
];
export const demoReplies: Record<OrganizerThread, string> = {
  main: "Here’s the working plan for the Neighborhood Resource Fair in Tucson next month.\n\n1. Confirm which resources residents need.\n2. Research local partners and compare accessible venues.\n3. Shortlist food trucks and confirm quotes.\n4. Build the timeline, volunteer roles, and RSVP plan.\n5. Prepare invitations for review.\n\nThe sample Facebook draft, venue hold, and $250 deposit are waiting in Approvals. Nothing has been posted, booked, or paid. These are illustrative examples, not completed research.",
  venue:
    "Compare Reid Park Community Center and other accessible community spaces. Confirm capacity for 200, availability, permits, accessibility, and full cost directly. The prototype has no verified venue quotes or citations; run live Discover research in your organization for evidence.",
  outreach:
    demoApprovals[0]!.content +
    "\n\nDraft only. Review the audience and final event details before publishing.",
  volunteers:
    "Suggested roles: welcome desk, partner support, accessibility support, setup, and cleanup. Ask volunteers to opt in, confirm their preferred shifts, and prepare a short briefing. No volunteer has been contacted.",
};
