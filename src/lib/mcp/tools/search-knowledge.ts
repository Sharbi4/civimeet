import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "search_shared_knowledge",
  title: "Search shared knowledge",
  description:
    "Search an organization's shared knowledge notes (mission, history, policies) by title or text.",
  inputSchema: {
    organizationId: organizationIdInput,
    query: z.string().trim().min(1).max(100).optional().describe("Words to look for. Omit to list recent notes."),
    limit: z.number().int().min(1).max(20).optional().describe("Maximum notes to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, query: search, limit }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    let query = db
      .from("organization_knowledge")
      .select("id,title,content,source_url,updated_at")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 10);
    if (search) {
      const term = search.replace(/[%_,()]/g, " ");
      query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) throw new ToolError("Could not read shared knowledge right now.");
    const notes = (data ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content.slice(0, 2000),
      sourceUrl: n.source_url,
      updatedAt: n.updated_at,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Shared knowledge for ${organization.name}:`,
            notes.map((n) => `${n.title}: ${n.content.slice(0, 300)}`),
            "No matching knowledge notes.",
          ),
        },
      ],
      structuredContent: { organization: organization.name, notes },
    };
  },
});
