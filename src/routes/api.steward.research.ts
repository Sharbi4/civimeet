import { createFileRoute } from "@tanstack/react-router";
import { handleStewardResearch, stewardResearchStatus } from "@/lib/steward-research.server";
export const Route = createFileRoute("/api/steward/research")({
  server: {
    handlers: {
      GET: () => stewardResearchStatus(),
      POST: ({ request }) => handleStewardResearch(request),
    },
  },
});
