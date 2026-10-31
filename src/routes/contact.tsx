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
      <p>Need help or want to talk about CiviMeet? Email our team.</p>
      <p className="mt-4">
        <a href="mailto:support@civimeet.com" className="font-medium text-primary underline underline-offset-4 hover:text-foreground">
          support@civimeet.com
        </a>
      </p>
    </SimplePage>
  ),
});
