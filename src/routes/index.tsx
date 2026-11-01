import { createFileRoute } from "@tanstack/react-router";
import { CompactHome } from "@/components/home/CompactHome";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CiviMeet — The AI community-building agent" },
      {
        name: "description",
        content:
          "Explore the AI agent CiviMeet is building for community growth, social presence, events, and vendor coordination through an authorized browser.",
      },
      {
        property: "og:title",
        content: "CiviMeet — Start a community. Give it momentum.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content:
          "Your mission, your community, and an AI agent designed to bring the work together.",
      },
    ],
  }),
  component: CompactHome,
});
