import { z } from "zod";

/**
 * Payment rules Civi and its helper agents follow. The database function
 * `request_agent_payment` enforces the same rule; this mirror keeps the UI and
 * chat replies honest about what will happen before anything is requested.
 */
export const paymentCategories = ["vendor", "venue", "ad_boost", "platform_fee", "other"] as const;
export type PaymentCategory = (typeof paymentCategories)[number];
export const categoryLabels: Record<PaymentCategory, string> = {
  vendor: "Vendor",
  venue: "Venue",
  ad_boost: "Ad boost",
  platform_fee: "Platform fee",
  other: "Other",
};

export type PaymentSettings = { monthlyBudgetCents: number; autoApproveLimitCents: number };
export type PaymentDecision = {
  status: "approved" | "needs_approval";
  approval: "auto" | "pending";
  overBudget: boolean;
};

/** Small payments inside the monthly budget go through on their own; everything else waits for a person. */
export function decidePayment(
  amountCents: number,
  settings: PaymentSettings | null,
  committedThisMonthCents: number,
): PaymentDecision {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1)
    throw new Error("Payment amount must be at least one cent.");
  const overBudget =
    !settings || committedThisMonthCents + amountCents > settings.monthlyBudgetCents;
  const automatic = !overBudget && amountCents <= (settings?.autoApproveLimitCents ?? 0);
  return automatic
    ? { status: "approved", approval: "auto", overBudget: false }
    : { status: "needs_approval", approval: "pending", overBudget };
}

export function validateSettings(settings: PaymentSettings) {
  if (settings.monthlyBudgetCents < 0 || settings.monthlyBudgetCents > 100_000_000)
    return "Monthly budget must be between $0 and $1,000,000.";
  if (settings.autoApproveLimitCents < 0 || settings.autoApproveLimitCents > 1_000_000)
    return "Automatic approval limit must be between $0 and $10,000.";
  if (settings.autoApproveLimitCents > settings.monthlyBudgetCents)
    return "Automatic approval limit cannot be more than the monthly budget.";
  return null;
}

/** Arguments Civi supplies when it asks to pay for something. */
export const paymentRequestSchema = z
  .object({
    payee: z.string().trim().min(2).max(200),
    purpose: z.string().trim().min(3).max(1000),
    category: z.enum(paymentCategories),
    amount_usd: z.number().positive().max(1_000_000),
    helper: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,39}$/)
      .optional(),
  })
  .strict();

export const statusLabels: Record<string, string> = {
  needs_approval: "Needs your approval",
  approved: "Approved · not paid yet",
  rejected: "Declined",
  paid: "Paid",
  failed: "Payment failed",
  cancelled: "Cancelled",
};
