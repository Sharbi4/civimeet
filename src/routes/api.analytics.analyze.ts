import { createFileRoute } from "@tanstack/react-router";
import { handleAnalyticsAnalysis } from "@/lib/analytics-analysis.server";

export const Route = createFileRoute("/api/analytics/analyze")({
  server: { handlers: { POST: ({ request }) => handleAnalyticsAnalysis(request) } },
});