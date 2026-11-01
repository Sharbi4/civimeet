import { Link } from "@tanstack/react-router";
import { Globe, MessageCircle, CalendarDays, Wallet, ArrowRight, ShieldCheck } from "lucide-react";
import "./agent-vision.css";

const ambitions = [
  {
    Icon: Globe,
    title: "An agent with a browser of its own.",
    copy: "The goal is an agent that works inside your authorized accounts: navigating websites, preparing actions, and carrying out approved work. Watch it work, step in when needed, and keep control.",
  },
  {
    Icon: MessageCircle,
    title: "A presence people come to know.",
    copy: "Start from your first followers or build on an existing community. The planned agent creates content, shares useful local information, and handles approved comments and outreach in your organization’s voice.",
  },
  {
    Icon: CalendarDays,
    title: "Online connections. Real-world plans.",
    copy: "Discover local vendors and partners, shape an event, then bring invitations, calendar invites, RSVPs, and follow-ups into the same workflow. Research and planning are available; connected execution is being built.",
  },
  {
    Icon: Wallet,
    title: "Your ambition, within your budget.",
    copy: "The planned budget workflow lets you set a monthly limit, review vendor costs, and approve payments through Stripe and Plaid. A spending limit is a boundary—not permission to pay without your approval.",
  },
];

export function AgentVision({ compact = false }: { compact?: boolean }) {
  return (
    <section className="cm-agent-vision" aria-labelledby="agent-vision-title">
      <div className="cm-agent-vision-heading">
        <p className="cmc-eyebrow">The community-building agent we’re creating</p>
        <h2 id="agent-vision-title">
          From your first hello.
          <br />
          To a community with a life of its own.
        </h2>
        <p>
          Your mission gives it purpose. Your channels give it a place to show up. CiviMeet’s vision
          is one agent that keeps the conversations, relationships, and events moving together.
        </p>
      </div>
      <div className="cm-agent-vision-grid">
        {ambitions.map(({ Icon, title, copy }) => (
          <article key={title}>
            <Icon aria-hidden="true" size={24} />
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
      <div className="cm-agent-vision-control">
        <ShieldCheck size={19} aria-hidden="true" />
        <p>
          Represent your organization transparently. Review public posts, messages, bookings, and
          payments before they go out.
        </p>
      </div>
      <details className="cm-agent-availability">
        <summary>Available today—and what’s coming next</summary>
        <p>
          <strong>Available:</strong> sourced research, vendor discovery, organization knowledge,
          event plans, drafts and approval records, controlled public-web browser sessions, and
          isolated voice planning.
        </p>
        <p>
          <strong>In development:</strong> saved social-account login, autonomous social management,
          publishing and messaging, calendar invitations, RSVP follow-through, monthly spending
          controls, and Stripe/Plaid vendor payments. Voice is not yet connected to organization
          memory or action execution.
        </p>
        <p>
          <strong>Channel roadmap:</strong> Facebook Pages, Instagram, LinkedIn, X, Reddit,
          Nextdoor, Eventbrite, and calendar tools, where authorized and supported. Availability
          varies by platform. Facebook Groups are monitor-and-draft only; automated group creation
          and posting are not supported.
        </p>
      </details>
      <Link to={compact ? "/how-it-works" : "/get-started"} className="cm-agent-vision-link">
        {compact ? "Meet the agent behind the community" : "Explore CiviMeet with your team"}
        <ArrowRight size={17} />
      </Link>
    </section>
  );
}
