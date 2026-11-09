import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "list_community_needs",
  title: "List community needs",
  description: "List questions, concerns and requests the community has raised with an organization.",
  inputSchema: {
    organizationId: organizationIdInput,
    status: z.enum(["open", "resolved", "all"]).optional().describe("Which needs to include (default open)."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum needs to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, status, limit }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    const wanted = status ?? "open";
    let query = db
      .from("community_needs")
      .select("id,title,detail,kind,priority,status,source_url,created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (wanted !== "all") query = query.eq("status", wanted);
    const { data, error } = await query;
    if (error) throw new ToolError("Could not read community needs right now.");
    const needs = (data ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      detail: n.detail,
      kind: n.kind,
      priority: n.priority,
      status: n.status,
      sourceUrl: n.source_url,
      createdAt: n.created_at,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Community needs for ${organization.name} (${wanted}):`,
            needs.map((n) => `${n.title} — ${n.kind}${n.priority === "high" ? ", high priority" : ""} (${n.status})`),
            "No matching community needs.",
          ),
        },
      ],
      structuredContent: { organization: organization.name, needs },
    };
  },
});
