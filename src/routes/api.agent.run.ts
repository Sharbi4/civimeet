import { createFileRoute } from "@tanstack/react-router";
import { handleAgentRun } from "@/lib/agent-runner.server";
export const Route = createFileRoute("/api/agent/run")({
  server: {
    handlers: {
      POST: ({ request }) => handleAgentRun(request),
    },
  },
});
