import { createFileRoute } from "@tanstack/react-router";
import { SimplePage } from "@/components/site/SimplePage";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — CiviMeet" },
      { name: "description", content: "CiviMeet is the AI operating system for community engagement and real-world organizing." },
      { property: "og:title", content: "About CiviMeet" },
      { property: "og:description", content: "Why we believe an AI organizer should become a fixture of the community." },
    ],
  }),
  component: () => (
    <SimplePage eyebrow="About" title="About CiviMeet">
      <p>CiviMeet provides AI-powered community organizers for nonprofits, civic organizations, local governments, and membership groups.</p>
      <p>Our core idea: an AI organizer should become a fixture of the community. It consistently provides useful information, supports discussions, keeps continuity, and builds organizational knowledge over time, then helps turn that engagement into real-world gatherings.</p>
      <p>The organizer always acts through a clearly identified organizational account, discloses AI assistance, and leaves important decisions to people.</p>
    </SimplePage>
  ),
});
