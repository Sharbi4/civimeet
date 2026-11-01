import { createFileRoute } from "@tanstack/react-router";
import { DemoOrganizerWorkspace } from "@/components/workspace/OrganizerWorkspace";
export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "CiviMeet — Interactive workspace demo" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemoOrganizerWorkspace,
});
