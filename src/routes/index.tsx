import { createFileRoute } from "@tanstack/react-router";
import { CompactHome } from "@/components/home/CompactHome";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CiviMeet — Your AI community organizer" },
      {
        name: "description",
        content:
          "Find local vendors and resources, draft community updates, and plan events with CiviMeet. AI handles the preparation. Your team stays in control.",
      },
      {
        property: "og:title",
        content: "CiviMeet — Bring people together. Let AI handle the prep.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Local research, community updates, and event planning in one workspace.",
      },
    ],
  }),
  component: CompactHome,
});
