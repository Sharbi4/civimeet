import playbooks from "@/lib/platform-playbooks.json";

export type StewardTask = {
  id: string;
  label: string;
  status: string;
  title: string;
  lines: { k: string; v: string }[];
  footer: string;
};

// Illustrative content only — no real residents, accounts or outcomes.
export const stewardTasks: StewardTask[] = [
  {
    id: "discover",
    label: "Discover a need",
    status: "Pattern noticed",
    title: "Families keep asking where to find weekend food support",
    lines: [
      { k: "Signal", v: "Similar questions appeared in sample conversations" },
      { k: "Who it affects", v: "Parents near the east-side library (example)" },
      { k: "Steward note", v: "Worth a sourced answer before suggesting an event" },
    ],
    footer: "Noted in organization memory · example data",
  },
  {
    id: "research",
    label: "Research with sources",
    status: "Sources attached",
    title: "Three weekend food resources, with references",
    lines: [
      { k: "Source 1", v: "County food bank directory — hours verified" },
      { k: "Source 2", v: "Library community board — Saturday pantry" },
      { k: "Unknown", v: "Holiday hours not published — flagged" },
    ],
    footer: "Every claim keeps its source link · unknowns stay visible",
  },
  {
    id: "draft",
    label: "Draft for approval",
    status: "Waiting for a human",
    title: "A helpful reply, prepared — not posted",
    lines: [
      { k: "Draft", v: "“Here are three places open on weekends, with hours and links…”" },
      { k: "Disclosure", v: "Identified as your organization’s AI Steward" },
      { k: "Next step", v: "A staff member approves the exact wording" },
    ],
    footer: "Nothing is sent without approval of the exact content",
  },
  {
    id: "gather",
    label: "Plan a gathering",
    status: "Plan proposed",
    title: "A Saturday resource fair at the library courtyard",
    lines: [
      { k: "Venue", v: "Accessible entrance, shade, nearby transit (example)" },
      { k: "Partners", v: "Food bank table, local coffee cart — to confirm" },
      { k: "Follow-up", v: "Thank attendees and log new questions" },
    ],
    footer: "Bookings and payments always require separate approval",
  },
];

export type PlatformStatus = "available" | "planned" | "restricted" | "not-connected";

export const statusLabel: Record<PlatformStatus, string> = {
  available: "Supervised public browsing available",
  planned: "Planned",
  restricted: "Restricted · pending provider access",
  "not-connected": "Not connected",
};

type Key = keyof typeof playbooks;
export type HomePlatform = {
  id: string;
  name: string;
  short: string;
  status: PlatformStatus;
  example: string;
  supported: string[];
  notSupported: string[];
  access: string;
};

const p = (k: Key) => ({ ...playbooks[k], contributions: playbooks[k].contributions as [string, ...string[]] });

export const homePlatforms: HomePlatform[] = [
  {
    id: "web",
    name: "Public websites",
    short: "Web",
    status: "available",
    example: p("web").contributions[0],
    supported: [
      "Sourced web research",
      "Supervised snapshots of admin-approved public pages",
    ],
    notSupported: ["Logging in to private sites", "Continuous live streaming or unattended browsing"],
    access: p("web").access,
  },
  {
    id: "eventbrite",
    name: "Eventbrite",
    short: "Eb",
    status: "planned",
    example: p("eventbrite").contributions[0],
    supported: ["Drafting event plans inside CiviMeet"],
    notSupported: ["Creating or publishing Eventbrite events", "Managing attendee lists"],
    access: p("eventbrite").access,
  },
  {
    id: "facebook",
    name: "Facebook Pages",
    short: "Fb",
    status: "restricted",
    example: p("facebook").contributions[0],
    supported: ["Drafting posts for human review inside CiviMeet"],
    notSupported: ["Posting to Pages", "Group or personal-profile access"],
    access: p("facebook").access,
  },
  {
    id: "reddit",
    name: "Reddit",
    short: "Rd",
    status: "restricted",
    example: p("reddit").contributions[0],
    supported: ["Planning respectful contributions inside CiviMeet"],
    notSupported: ["Reading or posting via the Reddit API"],
    access: p("reddit").access,
  },
  {
    id: "nextdoor",
    name: "Nextdoor",
    short: "Nd",
    status: "restricted",
    example: p("nextdoor").contributions[0],
    supported: ["Drafting neighborhood updates for review"],
    notSupported: ["Publishing to Nextdoor", "Any approved integration today"],
    access: p("nextdoor").access,
  },
  {
    id: "instagram",
    name: "Instagram",
    short: "Ig",
    status: "planned",
    example: p("instagram").contributions[0],
    supported: ["Drafting captions for human review"],
    notSupported: ["Publishing or reading Instagram content"],
    access: p("instagram").access,
  },
  {
    id: "x",
    name: "X",
    short: "X",
    status: "not-connected",
    example: p("x").contributions[0],
    supported: ["Drafting replies for human review"],
    notSupported: ["Posting, replying or monitoring on X"],
    access: p("x").access,
  },
];

export const audiences = [
  {
    slug: "nonprofits",
    name: "Nonprofits",
    line: "Stay present with supporters between campaigns.",
    text: "Answer recurring volunteer questions with sourced information, share program updates consistently, and turn interest into volunteer days.",
  },
  {
    slug: "neighborhood-associations",
    name: "Neighborhood associations",
    line: "Keep neighbors connected without adding board workload.",
    text: "Plan cleanups and block parties, research local vendors and venues, and keep follow-ups from slipping through the cracks.",
  },
  {
    slug: "membership-organizations",
    name: "Membership organizations",
    line: "Give members a reason to gather — regularly.",
    text: "Answer member questions from your own knowledge, plan recurring gatherings, and remember what members asked for last time.",
  },
  {
    slug: "civic-organizations",
    name: "Civic & municipal groups",
    line: "Inform residents, with approval at every step.",
    text: "Explain issues using approved resources, research accessible venues for forums, and keep a record of community concerns.",
  },
] as const;
