import { createFileRoute } from "@tanstack/react-router";
import { SimplePage } from "@/components/site/SimplePage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CiviMeet" },
      { name: "description", content: "The terms that govern how organizations use CiviMeet and Civi, its community organizing agent." },
      { property: "og:title", content: "CiviMeet Terms of Service" },
      { property: "og:description", content: "The terms that govern how organizations use CiviMeet and Civi, its community organizing agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SimplePage eyebrow="Legal" title="Terms of Service" updated="November 9, 2026">
      <p>
        These terms govern your organization’s use of CiviMeet, including Civi, our community organizing agent, its helper agents, and
        the CiviMeet website and workspace. By creating or using a CiviMeet workspace, you agree to these terms on behalf of your organization.
      </p>

      <h2>Your workspace and accounts</h2>
      <ul>
        <li>Workspaces belong to organizations. Administrators decide who has access and what role each member has.</li>
        <li>You are responsible for keeping sign-in details secure and for activity under your organization’s workspace.</li>
        <li>Members must provide accurate information and may only connect accounts they are authorized to use.</li>
      </ul>

      <h2>How Civi works on your behalf</h2>
      <ul>
        <li>Civi and its helpers research, draft, and prepare work for your organization through the accounts you connect.</li>
        <li>Posts, messages, bookings, and payments require approval by a person in your organization, except payments within the automatic approval limit your administrators set.</li>
        <li>Your organization is responsible for content it approves and publishes, and for commitments it approves with vendors, venues, and other partners.</li>
        <li>AI-generated research and drafts can be incomplete or wrong. Review them before relying on them.</li>
      </ul>

      <h2>Connected platforms</h2>
      <p>
        When you connect Facebook, Instagram, Threads, Reddit, Eventbrite, LinkedIn, or other services, you remain bound by those services’
        own terms. You can disconnect any account at any time in Settings → Connections.
      </p>

      <h2>Payments</h2>
      <p>
        Plans are billed as described on our pricing page or in your order. Payments Civi requests for vendors, venues, or promotions move
        only through your organization’s own connected payment account and within the budget and approval rules your administrators set.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>No spam, harassment, deceptive impersonation, or unsolicited political calling or messaging.</li>
        <li>No use that violates law, platform rules, or the rights and privacy of others.</li>
        <li>No attempts to access other organizations’ data or to bypass CiviMeet’s approval and security controls.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        Your organization owns the content and data it brings to CiviMeet. You grant us the limited rights needed to host, process, and display
        it to provide the service. We handle personal information as described in our Privacy Policy.
      </p>

      <h2>Suspension and ending service</h2>
      <p>
        You may stop using CiviMeet at any time. We may suspend access that breaks these terms or puts communities, platforms, or other
        customers at risk, and we will tell you why when we can.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        CiviMeet is provided as is. To the extent the law allows, we are not liable for indirect or consequential losses, and our total
        liability is limited to the fees your organization paid in the twelve months before the claim.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We will post changes to these terms on this page and update the date above. Questions? Email{" "}
        <a className="text-primary underline underline-offset-4" href="mailto:support@civimeet.com">support@civimeet.com</a>.
      </p>
    </SimplePage>
  ),
});
