import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  HeartHandshake,
  MessageCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { StewardMiniDemo } from "@/components/home/HomeInteractive";
import { PlatformExplorer } from "@/components/home/HomeExplore";
import { solutions } from "@/lib/site-content";
import "@/components/home/home-premium.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CiviMeet — AI Community Steward" },
      {
        name: "description",
        content:
          "An AI Community Steward that helps organizations research local needs, prepare thoughtful outreach, and coordinate real-world gatherings with human oversight.",
      },
      { property: "og:title", content: "CiviMeet — Build communities. Bring people together." },
      {
        property: "og:description",
        content:
          "From a community question to a real-world gathering. Meet your AI Community Steward.",
      },
    ],
  }),
  component: HomePage,
});

const journey = [
  { title: "Contribute", text: "Find a need. Share something useful.", icon: Search },
  { title: "Connect", text: "Keep the conversation going.", icon: MessageCircle },
  { title: "Convene", text: "Turn shared interest into a gathering.", icon: CalendarDays },
  { title: "Follow through", text: "Remember what matters next.", icon: HeartHandshake },
];

function Photo({
  name,
  alt,
  eager = false,
}: {
  name: "gathering" | "garden";
  alt: string;
  eager?: boolean;
}) {
  return (
    <img
      src={`/product/${name}-1280.jpg`}
      srcSet={`/product/${name}-640.jpg 640w, /product/${name}-1280.jpg 1280w`}
      sizes="(max-width: 760px) 100vw, 50vw"
      alt={alt}
      className="cmh-photo"
      width={1280}
      height={854}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
    />
  );
}

function HomePage() {
  return (
    <SiteLayout>
      <main className="cm-home">
        <section className="cmh-hero cmh-wrap" aria-labelledby="cmh-title">
          <div className="cmh-hero-copy">
            <p className="cmh-eyebrow">
              <span /> MEET YOUR AI COMMUNITY STEWARD
            </p>
            <h1 id="cmh-title">
              More connection. <em>Less coordination.</em>
            </h1>
            <p className="cmh-lead">
              A thoughtful AI organizer for the work behind stronger communities. Discover local
              needs, prepare helpful outreach, and bring people together in the real world.
            </p>
            <div className="cmh-actions">
              <Link className="cmh-button" to="/auth" search={{ mode: "signup" }}>
                Launch your Steward <ArrowUpRight size={19} />
              </Link>
              <a className="cmh-link" href="#see-it-work">
                See how it works <ArrowRight size={18} />
              </a>
            </div>
            <p className="cmh-hero-note">
              <ShieldCheck size={16} /> Transparent AI. Human decisions.
            </p>
          </div>
          <div className="cmh-hero-photo">
            <Photo
              name="gathering"
              eager
              alt="People talking together around a table in a leafy park"
            />
            <span>Built around people.</span>
          </div>
        </section>

        <section
          className="cmh-journey cmh-wrap"
          aria-label="From community need to follow-through"
        >
          <div className="cmh-journey-label">ONE CONTINUOUS JOURNEY</div>
          <div className="cmh-journey-list">
            {journey.map((step) => {
              const Icon = step.icon;
              return (
                <div className="cmh-journey-item" key={step.title}>
                  <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section
          className="cmh-section cmh-demo-section"
          id="see-it-work"
          aria-labelledby="cmh-demo-title"
        >
          <div className="cmh-wrap">
            <div className="cmh-heading">
              <div>
                <p className="cmh-eyebrow">THE STEWARD AT WORK</p>
                <h2 id="cmh-demo-title">
                  From a question to <em>a plan.</em>
                </h2>
              </div>
              <div>
                <p>
                  Explore a sample community workflow, from the first signal to a proposed
                  gathering. Every outward action stays under human control.
                </p>
                <Link className="cmh-link" to="/product" hash="interactive-demo">
                  Full interactive demo <ArrowUpRight size={18} />
                </Link>
              </div>
            </div>
            <StewardMiniDemo />
            <p className="cmh-caption">
              Illustrative example only. No live account actions, bookings, or messages.
            </p>
          </div>
        </section>

        <section
          className="cmh-section cmh-platforms cmh-wrap"
          aria-labelledby="cmh-platforms-title"
        >
          <div className="cmh-heading">
            <div>
              <p className="cmh-eyebrow">BEYOND YOUR DASHBOARD</p>
              <h2 id="cmh-platforms-title">
                Your community is <em>everywhere.</em>
              </h2>
            </div>
            <div>
              <p>
                Research public resources and prepare outreach across the channels that matter to
                you. Explore each platform's workflow and connection status.
              </p>
              <Link className="cmh-link" to="/platform-agents">
                Explore platform agents <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
          <PlatformExplorer />
        </section>

        <section className="cmh-section cmh-people" aria-labelledby="cmh-people-title">
          <div className="cmh-wrap cmh-people-grid">
            <div className="cmh-people-photo">
              <Photo name="garden" alt="Volunteers working together on a community garden" />
            </div>
            <div className="cmh-people-copy">
              <p className="cmh-eyebrow">PEOPLE FIRST, ALWAYS</p>
              <h2 id="cmh-people-title">
                Technology helps. <em>People decide.</em>
              </h2>
              <p>
                Your Steward helps carry the work forward while your organization stays responsible
                for what gets shared, planned, and approved.
              </p>
              <ul>
                <li>
                  <BookOpen size={20} /> Research and shared knowledge in one place
                </li>
                <li>
                  <ShieldCheck size={20} /> Human approval for public and financial actions
                </li>
                <li>
                  <CheckCircle2 size={20} /> A visible record of Steward activity
                </li>
              </ul>
              <Link className="cmh-link" to="/how-it-works">
                Learn how CiviMeet works <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
        </section>

        <section className="cmh-solutions cmh-wrap" aria-labelledby="cmh-solutions-title">
          <div>
            <p className="cmh-eyebrow">MADE FOR YOUR MISSION</p>
            <h2 id="cmh-solutions-title">For the people who bring people together.</h2>
          </div>
          <nav aria-label="Explore CiviMeet solutions">
            {solutions.map((solution) => (
              <Link key={solution.slug} to="/solutions/$slug" params={{ slug: solution.slug }}>
                {solution.name} <ArrowUpRight size={16} />
              </Link>
            ))}
          </nav>
        </section>

        <section className="cmh-final" aria-labelledby="cmh-final-title">
          <div className="cmh-wrap cmh-final-layout">
            <div>
              <p className="cmh-eyebrow">LET'S BRING PEOPLE TOGETHER</p>
              <h2 id="cmh-final-title">The next connection starts here.</h2>
            </div>
            <div>
              <Link className="cmh-button cmh-button-light" to="/auth" search={{ mode: "signup" }}>
                Launch your Steward <ArrowUpRight size={19} />
              </Link>
              <Link className="cmh-final-secondary" to="/pricing">
                View proposed pricing <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
        <p className="cmh-wrap cmh-credit">
          Editorial photos: Pexels contributors. People pictured are not CiviMeet customers.
        </p>
      </main>
    </SiteLayout>
  );
}
