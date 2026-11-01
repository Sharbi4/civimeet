import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass, Globe, MessageCircle, CalendarDays, ShieldCheck } from "lucide-react";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { AgentVision } from "@/components/product/AgentVision";
const story = [
  {
    Icon: Compass,
    title: "Give your agent a community to care about.",
    text: "Tell it where you serve, who you want to bring together, your mission, and your voice. Starting from zero or growing an established community changes the plan.",
  },
  {
    Icon: Globe,
    title: "Give it a place to show up.",
    text: "Choose your channels and define what helpful participation looks like. The browser roadmap connects authorized accounts so your agent can work on your behalf while you watch or step in. Private-account execution is still in development.",
  },
  {
    Icon: MessageCircle,
    title: "Let usefulness lead the conversation.",
    text: "Run Build our community presence in Organizer Chat. It researches public local communities, cites why they fit, and drafts useful tips and contributions. It needs the original conversation to prepare a relevant reply; it does not invent one or automatically send it.",
  },
  {
    Icon: CalendarDays,
    title: "Give those connections somewhere to go.",
    text: "Turn shared interests into an event plan. Research vendors and venues, shape the invitation, and prepare the next steps. Calendar invitations, RSVP follow-through and vendor payments are part of the connected workflow being built.",
  },
  {
    Icon: ShieldCheck,
    title: "Stay responsible for the final say.",
    text: "Review exact drafts and destinations before public actions. The planned monthly budget sets a ceiling, while each financial commitment still needs approval. Your agent represents your organization transparently.",
  },
];
export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How CiviMeet builds community — CiviMeet" },
      {
        name: "description",
        content:
          "An organization-specific agent, a browser workspace, and a path from community presence to events—with human approval.",
      },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader
        eyebrow="How your community agent works"
        title="Give it a mission. Build something people belong to."
        intro="One agent for your organization, with your location, voice, and goals at the center. A connected browser is the bridge from planning to action—the full workflow is being built in stages."
      />
      <div className="mx-auto max-w-4xl px-5 py-10">
        <div className="space-y-5">
          {story.map(({ Icon, title, text }) => (
            <article
              key={title}
              className="flex gap-4 rounded-2xl border border-blue-100 bg-white p-6"
            >
              <Icon className="shrink-0 text-blue-600" aria-hidden="true" size={25} />
              <div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </article>
          ))}
        </div>
        <Link className="mt-7 inline-block font-semibold text-blue-600" to="/demo">
          Explore the workspace demo →
        </Link>
      </div>
      <AgentVision />
    </SiteLayout>
  ),
});
