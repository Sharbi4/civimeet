import { createFileRoute } from "@tanstack/react-router";
import { SimplePage } from "@/components/site/SimplePage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service (Draft) — CiviMeet" },
      { name: "description", content: "Draft terms of service for CiviMeet." },
      { property: "og:title", content: "CiviMeet Terms (Draft)" },
      { property: "og:description", content: "Draft terms of service; final language pending." },
    ],
  }),
  component: () => (
    <SimplePage eyebrow="Legal" title="Terms of Service" draft>
      <p>CiviMeet provides software that helps organizations manage community engagement and events. Organizations are responsible for content published through their accounts and for approving financial commitments.</p>
      <p>AI-generated actions act on behalf of the organization through clearly identified accounts. Full terms will be published here.</p>
    </SimplePage>
  ),
});
