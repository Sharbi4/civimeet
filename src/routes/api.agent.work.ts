import { createFileRoute } from "@tanstack/react-router";
import { handleAgentWork } from "@/lib/agent-work.server";
export const Route = createFileRoute("/api/agent/work")({
  server: { handlers: { POST: ({ request }) => handleAgentWork(request) } },
});
