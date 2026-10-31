import { describe, expect, it } from "vitest";
import { dollarsToCents, formatMoney } from "@/lib/event-money";
import { buildPlatformInstructions, platformPlaybooks } from "@/lib/platform-playbooks";
import { platforms } from "@/lib/vendors";
describe("Event amounts", () => {
  it("converts decimal dollars exactly into integer cents", () => {
    expect(dollarsToCents("0.29")).toBe(29);
    expect(dollarsToCents("100.1")).toBe(10010);
    expect(dollarsToCents("0")).toBe(0);
    expect(formatMoney(12345)).toBe("$123.45");
  });
  it.each(["-1", "NaN", "1e5", "1.001", "1000000.01", "", "Infinity"])(
    "rejects unsupported money value %s",
    (value) => {
      expect(() => dollarsToCents(value)).toThrow();
    },
  );
});
describe("Platform steward contracts", () => {
  it.each(platforms)("gives %s a distinct bounded playbook and approval boundary", (platform) => {
    const instructions = buildPlatformInstructions(platform);
    expect(instructions).toContain(platformPlaybooks[platform].mission);
    expect(instructions).toContain("exact-content human approval");
    expect(instructions).toContain("only the payment service can execute");
    expect(instructions.length).toBeLessThanOrEqual(4000);
  });
});
