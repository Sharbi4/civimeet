import { createFileRoute } from "@tanstack/react-router";
import { agentBrowserStatus, handleAgentBrowser } from "@/lib/browser-agent.server";
export const Route = createFileRoute("/api/agent/browser")({
  server: {
    handlers: {
      GET: () => agentBrowserStatus(),
      POST: ({ request }) => handleAgentBrowser(request),
    },
  },
});
