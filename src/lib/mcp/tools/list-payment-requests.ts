import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dollars, organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "list_payment_requests",
  title: "List payment requests",
  description:
    "List payment requests Civi and its helpers have filed. Approved means a person or the budget rule allowed it; it is only paid once a payment account confirms it.",
  inputSchema: {
    organizationId: organizationIdInput,
    limit: z.number().int().min(1).max(50).optional().describe("Maximum requests to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, limit }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    const { data, error } = await db
      .from("agent_payments")
      .select("id,payee,purpose,category,amount_cents,currency,approval,status,over_budget,paid_at,created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) throw new ToolError("Could not read payment requests right now.");
    const payments = (data ?? []).map((p) => ({
      id: p.id,
      payee: p.payee,
      purpose: p.purpose,
      category: p.category,
      amountCents: p.amount_cents,
      currency: p.currency,
      approval: p.approval,
      status: p.status,
      overBudget: p.over_budget,
      paid: p.paid_at !== null,
      createdAt: p.created_at,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Payment requests for ${organization.name}:`,
            payments.map(
              (p) =>
                `${dollars(p.amountCents)} to ${p.payee} for ${p.purpose} — ${p.approval}${p.paid ? ", paid" : ", not paid"}`,
            ),
            "No payment requests yet.",
          ),
        },
      ],
      structuredContent: { organization: organization.name, payments },
    };
  },
});
