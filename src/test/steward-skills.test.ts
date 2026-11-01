import { describe, it, expect } from "vitest";
import { selectStewardSkill, stewardSkills, stewardSkillIds } from "@/lib/steward-skills";
describe("Steward skill routing", () => {
  it("routes community-building requests before generic event planning", () => {
    expect(selectStewardSkill("Build our community presence and plan events")).toBe(
      "community_presence",
    );
    expect(selectStewardSkill("Find relevant groups near our neighborhood")).toBe(
      "community_presence",
    );
    expect(selectStewardSkill("Prepare a helpful comment on this conversation")).toBe(
      "community_presence",
    );
    expect(stewardSkills.community_presence.collectVendors).toBe(false);
  });
  it("routes contribution, event, attendance and follow-up intentions", () => {
    expect(selectStewardSkill("Find local community resources")).toBe("community_research");
    expect(selectStewardSkill("Plan a community event")).toBe("event_design");
    expect(selectStewardSkill("Draft RSVP invitations")).toBe("attendance_outreach");
    expect(selectStewardSkill("Prepare follow-up after the event")).toBe("follow_through");
  });
  it("only enables collection with a scoped agent and local area", () => {
    expect(selectStewardSkill("Find local vendors", false)).not.toBe("local_partner_discovery");
    expect(selectStewardSkill("Find local vendors", true)).toBe("local_partner_discovery");
  });
  it("keeps the successor loop within known skills", () => {
    for (const id of stewardSkillIds) expect(stewardSkillIds).toContain(stewardSkills[id].next);
  });
});
