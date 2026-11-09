import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { organizationIdInput, workspaceFor } from "../workspace";

export default defineTool({
  name: "record_community_need",
  title: "Record a community need",
  description:
    "Save a question, concern or request from the community to an organization's open needs list. Requires editor access; nothing is sent to anyone.",
  inputSchema: {
    organizationId: organizationIdInput,
    title: z.string().trim().min(3).max(200).describe("Short summary of the need."),
    detail: z.string().max(4000).optional().describe("More context about the need."),
    kind: z
      .enum(["question", "resource", "concern", "gathering", "celebration"])
      .describe("What kind of need this is."),
    priority: z.enum(["normal", "high"]).optional().describe("Urgency (default normal)."),
    sourceUrl: z
      .string()
      .max(2048)
      .regex(/^https?:\/\/[^\s@]+$/)
      .optional()
      .describe("Link where the need was raised, if any."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ organizationId, title, detail, kind, priority, sourceUrl }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    if (!["owner", "admin", "organizer"].includes(organization.role))
      throw new ToolError("Recording needs requires editor access in this organization.");
    const { data, error } = await db.rpc("record_community_need", {
      workspace: organization.id,
      need_title: title,
      need_detail: detail ?? "",
      need_kind: kind,
      source: sourceUrl ?? "",
      urgency: priority ?? "normal",
    });
    if (error) throw new ToolError("Could not save that community need.");
    return {
      content: [{ type: "text", text: `Saved "${title}" to ${organization.name}'s open community needs.` }],
      structuredContent: { id: String(data), organization: organization.name },
    };
  },
});
