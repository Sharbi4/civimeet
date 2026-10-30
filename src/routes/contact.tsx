import { createFileRoute } from "@tanstack/react-router";
import { SimplePage } from "@/components/site/SimplePage";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — CiviMeet" },
      { name: "description", content: "Get in touch with the CiviMeet team about plans and partnerships." },
      { property: "og:title", content: "Contact CiviMeet" },
      { property: "og:description", content: "Talk to us about CiviMeet for your organization." },
    ],
  }),
  component: () => (
    <SimplePage eyebrow="Contact" title="Contact us" intro="Questions about plans, Enterprise needs, or partnerships.">
      <p>A contact form will be added once message delivery is set up. Until then, contact details are pending.</p>
    </SimplePage>
  ),
});
