import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { LiveOrganizerWorkspace } from "@/components/workspace/OrganizerWorkspace";
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Community Organizer — CiviMeet" },
      { name: "description", content: "Plan community gatherings with your CiviMeet organizer, scoped research, preparation-only voice and human approvals." },
      { property: "og:title", content: "Your Community Organizer — CiviMeet" },
      { property: "og:description", content: "Your organization’s workspace for community planning, research and reviewed drafts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <WorkspaceGate compact>
      <LiveOrganizerWorkspace />
    </WorkspaceGate>
  ),
});
