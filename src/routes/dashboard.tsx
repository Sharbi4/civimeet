import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { LiveOrganizerWorkspace } from "@/components/workspace/OrganizerWorkspace";
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Community Organizer — CiviMeet" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <WorkspaceGate compact>
      <LiveOrganizerWorkspace />
    </WorkspaceGate>
  ),
});
