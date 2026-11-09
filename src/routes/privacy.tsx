import { createFileRoute } from "@tanstack/react-router";
import { SimplePage } from "@/components/site/SimplePage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CiviMeet" },
      { name: "description", content: "How CiviMeet collects, uses, and protects information for organizations and the communities they serve." },
      { property: "og:title", content: "CiviMeet Privacy Policy" },
      { property: "og:description", content: "How CiviMeet collects, uses, and protects information for organizations and the communities they serve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SimplePage eyebrow="Legal" title="Privacy Policy" updated="November 9, 2026">
      <p>
        CiviMeet helps organizations bring their communities together. This policy explains what information we handle, why, and the
        choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, and sign-in information for workspace members.</li>
        <li><strong>Workspace content:</strong> conversations with Civi, plans, events, vendor and venue notes, approvals, and budgets your organization creates.</li>
        <li><strong>Connected accounts:</strong> access your organization grants when it connects services such as Facebook, Eventbrite, or LinkedIn.</li>
        <li><strong>Requests from our website:</strong> details you send through our contact and get started forms.</li>
        <li><strong>Usage:</strong> pages visited on our website, measured without personal URL details.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your workspace and let Civi and its helpers research, draft, and prepare work for your organization.</li>
        <li>To keep the service secure, prevent abuse, and follow up on requests you send us.</li>
        <li>We do not sell personal information, and we do not use your workspace content to advertise to you.</li>
      </ul>

      <h2>How we protect it</h2>
      <ul>
        <li>Each organization’s records are kept separate, and members see only the workspaces they belong to.</li>
        <li>Saved sign-ins and connection tokens are encrypted and are never shown back to anyone, including your own team.</li>
        <li>The agent’s browser screenshots are not stored. Disconnecting an account removes its saved access.</li>
        <li>We do not store sensitive personal inferences or private messages without an appropriate legal basis and permission.</li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We use trusted providers to run CiviMeet, including hosting and database services, AI model providers for Civi’s reasoning, research,
        and voice, a secure browser service for the agent, email delivery, and website analytics. They process information only to provide
        those services to us.
      </p>

      <h2>Retention and your choices</h2>
      <ul>
        <li>Workspace content is kept while your organization uses CiviMeet. Administrators can ask us to export or delete it.</li>
        <li>You can disconnect connected accounts at any time in Settings → Connections.</li>
        <li>You can ask to see, correct, or delete your personal information by contacting us.</li>
      </ul>

      <h2>Changes and contact</h2>
      <p>
        We will post changes to this policy on this page and update the date above. Questions or requests? Email{" "}
        <a className="text-primary underline underline-offset-4" href="mailto:support@civimeet.com">support@civimeet.com</a>.
      </p>
    </SimplePage>
  ),
});
