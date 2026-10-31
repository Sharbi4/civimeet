import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { AnalyticsReports } from "@/components/workspace/AnalyticsReports";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [
    { title: "Traffic & Conversion Analytics — CiviMeet" },
    { name: "description", content: "Analyze Google Analytics reports and prioritize evidence-based conversion improvements for your community organization." },
    { property: "og:title", content: "Traffic & Conversion Analytics — CiviMeet" },
    { property: "og:description", content: "Turn traffic reports into actionable conversion recommendations in your CiviMeet workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: () => <WorkspaceGate><AnalyticsReports /></WorkspaceGate>,
});