import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "list_vendors",
  title: "List vendors",
  description:
    "List vendors and venues saved in an organization's directory, optionally filtered by category or name.",
  inputSchema: {
    organizationId: organizationIdInput,
    search: z.string().trim().min(1).max(100).optional().describe("Match against vendor name or category."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum vendors to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, search, limit }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    let query = db
      .from("vendors")
      .select("id,name,category,contact_name,email,phone,service_areas,status,notes")
      .eq("organization_id", organization.id)
      .order("name")
      .limit(limit ?? 25);
    if (search) {
      const term = search.replace(/[%_,()]/g, " ");
      query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) throw new ToolError("Could not read vendors right now.");
    const vendors = (data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      contactName: v.contact_name,
      email: v.email,
      phone: v.phone,
      serviceAreas: v.service_areas,
      status: v.status,
      notes: v.notes,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Vendors for ${organization.name}:`,
            vendors.map((v) => `${v.name} — ${v.category || "uncategorized"} (${v.status})`),
            "No matching vendors.",
          ),
        },
      ],
      structuredContent: { organization: organization.name, vendors },
    };
  },
});
