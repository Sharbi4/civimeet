import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "list_approvals",
  title: "List approvals",
  description:
    "List posts, messages and bookings Civi has drafted for review. Drafts are never published until a person approves them in CiviMeet.",
  inputSchema: {
    organizationId: organizationIdInput,
    status: z
      .enum(["pending", "approved", "rejected", "all"])
      .optional()
      .describe("Which drafts to include (default pending)."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum drafts to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, status, limit }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    const wanted = status ?? "pending";
    let query = db
      .from("organizer_approvals")
      .select("id,title,kind,destination,status,content,created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (wanted !== "all") query = query.eq("status", wanted);
    const { data, error } = await query;
    if (error) throw new ToolError("Could not read approvals right now.");
    const approvals = (data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      destination: a.destination,
      status: a.status,
      content: a.content.slice(0, 2000),
      createdAt: a.created_at,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Drafts for ${organization.name} (${wanted}):`,
            approvals.map((a) => `${a.title} — ${a.kind} for ${a.destination || "no destination"} (${a.status})`),
            `Nothing ${wanted === "all" ? "" : wanted + " "}for review.`,
          ),
        },
      ],
      structuredContent: { organization: organization.name, approvals },
    };
  },
});
