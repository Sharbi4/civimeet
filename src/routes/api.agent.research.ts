import { createFileRoute } from "@tanstack/react-router";
import { handleResearch, researchStatus } from "@/lib/research-api.server";

export const Route = createFileRoute("/api/agent/research")({
  server: {
    handlers: {
      GET: () => researchStatus(),
      POST: ({ request }) => handleResearch(request),
    },
  },
});
