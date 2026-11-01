import { createFileRoute } from "@tanstack/react-router";
import { DemoRequestPage } from "@/components/site/DemoRequestPage";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — CiviMeet" },
      { name: "description", content: "Get in touch with the CiviMeet team about plans and partnerships." },
      { property: "og:title", content: "Contact CiviMeet" },
      { property: "og:description", content: "Talk to us about CiviMeet for your organization." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <DemoRequestPage source="contact" />,
});
