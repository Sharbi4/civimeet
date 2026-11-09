import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dollars, organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "list_gatherings",
  title: "List gatherings",
  description:
    "List an organization's planned community gatherings (events) with date, venue, budget and review status.",
  inputSchema: {
    organizationId: organizationIdInput,
    upcomingOnly: z.boolean().optional().describe("Only include gatherings dated today or later."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum gatherings to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, upcomingOnly, limit }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    let query = db
      .from("community_events")
      .select("id,title,purpose,event_date,venue,geographic_area,budget_cents,status,outcome")
      .eq("organization_id", organization.id)
      .order("event_date", { ascending: true })
      .limit(limit ?? 20);
    if (upcomingOnly) query = query.gte("event_date", new Date().toISOString().slice(0, 10));
    const { data, error } = await query;
    if (error) throw new ToolError("Could not read gatherings right now.");
    const gatherings = (data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      purpose: e.purpose,
      date: e.event_date,
      venue: e.venue,
      area: e.geographic_area,
      budgetCents: e.budget_cents,
      status: e.status,
      outcome: e.outcome,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Gatherings for ${organization.name}:`,
            gatherings.map(
              (g) =>
                `${g.date} — ${g.title} at ${g.venue || "venue not set"} (${g.status}, budget ${dollars(g.budgetCents)})`,
            ),
            `${organization.name} has no gatherings yet.`,
          ),
        },
      ],
      structuredContent: { organization: organization.name, gatherings },
    };
  },
});
