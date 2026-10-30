import { createFileRoute } from "@tanstack/react-router";
import { SimplePage } from "@/components/site/SimplePage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy (Draft) — CiviMeet" },
      { name: "description", content: "Draft privacy policy for CiviMeet." },
      { property: "og:title", content: "CiviMeet Privacy (Draft)" },
      { property: "og:description", content: "Draft privacy policy; final language pending." },
    ],
  }),
  component: () => (
    <SimplePage eyebrow="Legal" title="Privacy Policy" draft>
      <p>Each organization's records are kept separate. CiviMeet does not store sensitive personal inferences or private messages without an appropriate legal basis and permission.</p>
      <p>Full privacy terms will be published here.</p>
    </SimplePage>
  ),
});
