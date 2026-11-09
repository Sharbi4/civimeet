import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { listMemberships, textList } from "../workspace";

export default defineTool({
  name: "list_organizations",
  title: "List my organizations",
  description: "List the CiviMeet organizations you belong to, with your role in each.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const userId = ctx.getUserId();
    if (!ctx.isAuthenticated() || !userId) throw new ToolError("Sign in to CiviMeet to use this tool.");
    const organizations = await listMemberships(supabaseForUser(ctx), userId);
    return {
      content: [
        {
          type: "text",
          text: textList(
            "Your organizations:",
            organizations.map((o) => `${o.name} (${o.role}) — id ${o.id}`),
            "You aren't a member of any CiviMeet organization yet.",
          ),
        },
      ],
      structuredContent: { organizations },
    };
  },
});
