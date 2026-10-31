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
          "CiviMeet helps you research local needs, draft community updates, and plan real-life meetups. Your team stays in control.",
      },
      { property: "og:title", content: "CiviMeet — Build communities. Bring people together." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Find community needs. Prepare helpful updates. Plan a real-life meetup.",
      },
    ],
  }),
  component: HomePage,
});

const journey = [
  { title: "Contribute", text: "Find needs and useful resources.", icon: Search },
  { title: "Connect", text: "Draft updates and replies.", icon: MessageCircle },
  { title: "Meet Up", text: "Plan in-person events and RSVPs.", icon: CalendarDays },
  { title: "Follow through", text: "Keep track of what's next.", icon: HeartHandshake },
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
              <span /> YOUR AI COMMUNITY ORGANIZER
            </p>
            <h1 id="cmh-title">
              Bring people together. <em>Let AI do the groundwork.</em>
            </h1>
            <p className="cmh-lead">
              Find community needs. Prepare helpful updates. Plan real-life meetups. CiviMeet helps
              with the prep so your team can focus on people.
            </p>
            <div className="cmh-actions">
              <Link className="cmh-button" to="/get-started">
                Get started <ArrowUpRight size={19} />
              </Link>
              <a className="cmh-link" href="#see-it-work">
                See the demo <ArrowRight size={18} />
              </a>
            </div>
            <p className="cmh-hero-note">
              <ShieldCheck size={16} /> AI prepares. You approve.
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
          <div className="cmh-journey-label">HOW IT WORKS</div>
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
          <Link className="cmh-journey-more" to="/how-it-works">
            See the full process <ArrowUpRight size={16} />
          </Link>
        </section>

        <section
          className="cmh-section cmh-demo-section"
          id="see-it-work"
          aria-labelledby="cmh-demo-title"
        >
          <div className="cmh-wrap">
            <div className="cmh-heading">
              <div>
                <p className="cmh-eyebrow">SEE IT IN ACTION</p>
                <h2 id="cmh-demo-title">
                  See what your AI <em>actually does.</em>
                </h2>
              </div>
              <div>
                <p>
                  Pick a task. See how the Steward turns a community question into research, a
                  draft, or an event plan.
                </p>
                <Link className="cmh-link" to="/product" hash="interactive-demo">
                  Try the full product demo <ArrowUpRight size={18} />
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
              <p className="cmh-eyebrow">PLATFORMS & CHANNELS</p>
              <h2 id="cmh-platforms-title">
                Work where your <em>community is.</em>
              </h2>
            </div>
            <div>
              <p>
                Explore public websites and plan outreach for social platforms. See what's available
                now and what's still in development.
              </p>
              <Link className="cmh-link" to="/platform-agents">
                See platforms & capabilities <ArrowUpRight size={18} />
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
              <p className="cmh-eyebrow">YOU STAY IN CONTROL</p>
              <h2 id="cmh-people-title">
                AI does the prep. <em>You make the calls.</em>
              </h2>
              <p>
                CiviMeet prepares research and plans. You approve what gets posted, booked, or paid.
              </p>
              <ul>
                <li>
                  <BookOpen size={20} /> Research and answers, organized
                </li>
                <li>
                  <ShieldCheck size={20} /> Approval before public or financial actions
                </li>
                <li>
                  <CheckCircle2 size={20} /> See what your AI has done
                </li>
              </ul>
              <Link className="cmh-link" to="/how-it-works">
                How it works <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
        </section>

        <section className="cmh-solutions cmh-wrap" aria-labelledby="cmh-solutions-title">
          <div>
            <p className="cmh-eyebrow">MADE FOR YOUR MISSION</p>
            <h2 id="cmh-solutions-title">Built for groups that bring people together.</h2>
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
              <h2 id="cmh-final-title">Less admin. More community.</h2>
            </div>
            <div>
              <Link className="cmh-button cmh-button-light" to="/get-started">
                Get started <ArrowUpRight size={19} />
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
