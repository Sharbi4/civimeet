import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { organizationIdInput, textList, workspaceFor } from "../workspace";

export default defineTool({
  name: "list_connected_accounts",
  title: "List connected accounts",
  description:
    "Show which community accounts (Facebook, Instagram, Eventbrite and others) an organization has connected and their status. No logins or tokens are ever returned.",
  inputSchema: { organizationId: organizationIdInput },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId }, ctx) => {
    const { db, organization } = await workspaceFor(ctx, organizationId);
    const { data, error } = await db
      .from("organization_connectors")
      .select("connector,status,account_label,detail,connected_at")
      .eq("organization_id", organization.id)
      .order("connector");
    if (error) throw new ToolError("Could not read connected accounts right now.");
    const accounts = (data ?? []).map((c) => ({
      connector: c.connector,
      status: c.status,
      accountLabel: c.account_label,
      detail: c.detail,
      connectedAt: c.connected_at,
    }));
    return {
      content: [
        {
          type: "text",
          text: textList(
            `Accounts for ${organization.name}:`,
            accounts.map((a) => `${a.connector}: ${a.status}${a.accountLabel ? ` (${a.accountLabel})` : ""}`),
            "No accounts connected yet. Connect them in CiviMeet under Settings → Connections.",
          ),
        },
      ],
      structuredContent: { organization: organization.name, accounts },
    };
  },
});
