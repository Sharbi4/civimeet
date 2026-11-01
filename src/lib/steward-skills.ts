import type { ResearchInput } from "./research";
export const stewardSkillIds = [
  "community_research",
  "local_partner_discovery",
  "event_design",
  "attendance_outreach",
  "follow_through",
] as const;
export type StewardSkillId = (typeof stewardSkillIds)[number];
type Skill = {
  name: string;
  purpose: ResearchInput["purpose"];
  description: string;
  instructions: string;
  output: string;
  next: StewardSkillId;
  collectVendors: boolean;
};
export const stewardSkills: Record<StewardSkillId, Skill> = {
  community_research: {
    name: "Understand the community",
    purpose: "resources",
    collectVendors: false,
    description: "Find useful local resources and understand an emerging community need.",
    instructions:
      "SKILL: COMMUNITY RESEARCH. Start with the organization's mission, geography, open needs and prior knowledge. Search primary local sources. Separate direct evidence, inference, and unknowns. Do not infer community demand from a single comment. Return: need and audience; sourced resources; what would be useful now; uncertainty; one suggested next step. Prefer a helpful contribution before promoting an event. Never describe social listening as performed when no connected-channel evidence is provided.",
    output: "Sourced brief saved in organization knowledge and research history.",
    next: "local_partner_discovery",
  },
  local_partner_discovery: {
    name: "Find local partners",
    purpose: "vendors",
    collectVendors: true,
    description:
      "Research local vendors, save public business evidence, and draft a gathering proposal.",
    instructions:
      "SKILL: LOCAL PARTNER DISCOVERY. Use the supplied local area. Look for businesses actually serving it, not generic national lists. Search primary business websites and public business profiles. Collect published name, category, service area, business contact details and profile links only when sourced. Preserve unknowns. Compare existing vendor knowledge before recommending new options. Save candidates for review, never mark them verified. Prepare a contribution-first gathering proposal and draft opt-in attendance steps. Never contact or book a vendor.",
    output:
      "Up to five sourced vendor candidates, a draft Steward proposal, and shared research memory.",
    next: "event_design",
  },
  event_design: {
    name: "Shape a gathering",
    purpose: "events",
    collectVendors: false,
    description: "Turn a community interest into a practical event concept and preparation plan.",
    instructions:
      "SKILL: EVENT DESIGN. Explain the community need and why a gathering helps. Use existing organization context; label missing evidence. Return a draft with: purpose and audience; accessible venue criteria; sourced vendor options; proposed date choices (never availability claims); budget estimate and assumptions; volunteer responsibilities; preparation timeline; RSVP method; weather/access contingency; decisions required; follow-up. Do not fabricate attendance targets as forecasts. Explicitly separate proposed costs from quotes and approved spending. This skill drafts a plan only; it does not create a provider event, book a venue, or collect money.",
    output: "Event concept and preparation brief saved to the platform conversation and knowledge.",
    next: "attendance_outreach",
  },
  attendance_outreach: {
    name: "Prepare invitations",
    purpose: "general",
    collectVendors: false,
    description: "Draft useful, platform-specific invitations and an opt-in attendance plan.",
    instructions:
      "SKILL: ATTENDANCE OUTREACH. Use the platform assignment, organization voice and confirmed event details. If time/location/registration are unconfirmed, produce a clearly labeled interest-check draft instead of a final invitation. Return: audience and permission assumptions; draft owned-channel post; helpful comment draft only where relevant; invitation for opted-in contacts; RSVP reminder plan; moderation and accessibility considerations; exact fields needing approval. Do not scrape member contact details, mass-DM strangers, invent engagement, impersonate residents, or claim delivery. Never treat a community comment as consent for direct messages. No publish or send tool is available to this skill.",
    output: "Platform-specific outreach drafts and a review checklist; nothing sent.",
    next: "follow_through",
  },
  follow_through: {
    name: "Keep the connection",
    purpose: "general",
    collectVendors: false,
    description: "Prepare follow-up, capture lessons, and identify the next useful contribution.",
    instructions:
      "SKILL: FOLLOW THROUGH. Use only supplied event outcomes, feedback and participation records. Never invent completed tasks, attendance, satisfaction metrics or testimonials. Return: outstanding commitments; draft thank-you for opted-in participants; feedback questions; lessons to review before saving as facts; next contribution; responsible roles and suggested follow-up timing. Clearly label missing outcome data. Do not automatically send messages or mark tasks complete. Recommend a recurring gathering only when actual interest supports it.",
    output: "Follow-up and continuity brief saved as research memory, with explicit unknowns.",
    next: "community_research",
  },
};
/** Conservative intent routing selects an instruction preset, never grants external tools. */
export function selectStewardSkill(question: string, canCollect = false): StewardSkillId {
  if (/follow.?up|thank.?you|feedback|after the event/i.test(question)) return "follow_through";
  if (/invit|attendance|rsvp|promot|remind|outreach/i.test(question)) return "attendance_outreach";
  if (/vendor|cater|food truck|local partner/i.test(question) && canCollect)
    return "local_partner_discovery";
  if (/event|gathering|volunteer|budget|venue/i.test(question)) return "event_design";
  return "community_research";
}
