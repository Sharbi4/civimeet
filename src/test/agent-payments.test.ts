import { describe, expect, it } from "vitest";
import { decidePayment, paymentRequestSchema, validateSettings } from "@/lib/agent-payments";

// Monthly budget $1,000; anything $100 or less goes through on its own.
const settings = { monthlyBudgetCents: 100_000, autoApproveLimitCents: 10_000 };

describe("Civi payments with a monthly budget", () => {
  it("approves a small payment automatically when it fits the remaining budget", () => {
    expect(decidePayment(7_500, settings, 0)).toEqual({
      status: "approved",
      approval: "auto",
      overBudget: false,
    });
  });
  it("asks a person to approve anything above the automatic limit", () => {
    expect(decidePayment(10_001, settings, 0)).toMatchObject({
      status: "needs_approval",
      overBudget: false,
    });
  });
  it("asks a person when a small payment would go over the monthly budget", () => {
    expect(decidePayment(5_000, settings, 96_000)).toMatchObject({
      status: "needs_approval",
      overBudget: true,
    });
  });
  it("never pays automatically before a budget is set", () => {
    expect(decidePayment(100, null, 0)).toMatchObject({ status: "needs_approval" });
  });
  it("rejects an automatic limit larger than the monthly budget", () => {
    expect(validateSettings({ monthlyBudgetCents: 5_000, autoApproveLimitCents: 6_000 })).toMatch(
      /cannot be more/,
    );
  });
  it("only accepts known payment kinds from Civi", () => {
    expect(
      paymentRequestSchema.safeParse({
        payee: "Reid Park",
        purpose: "Pavilion deposit",
        category: "crypto",
        amount_usd: 50,
      }).success,
    ).toBe(false);
  });
});
