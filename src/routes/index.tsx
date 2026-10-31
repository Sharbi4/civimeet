import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowRight, Check, Users, CalendarDays, Eye, Lock, MonitorPlay } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AudienceSelector, PlatformExplorer, StewardMiniDemo } from "@/components/home/HomeInteractive";
import { solutions } from "@/lib/site-content";
import "@/components/product/product.css";
import "@/components/home/home.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CiviMeet — An AI Community Steward that keeps showing up" },
      {
        name: "description",
        content:
          "CiviMeet helps civic organizations understand community needs, prepare helpful contributions, coordinate gatherings and follow through — with human approval at every step.",
      },
      { property: "og:title", content: "Every community deserves someone who keeps showing up. | CiviMeet" },
      {
        property: "og:description",
        content: "Meet your AI Community Steward: sourced research, thoughtful drafts, real-world gatherings and follow-through.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Photo({ name, alt, eager = false, sizes = "(max-width: 760px) 100vw, 60vw", className = "" }: { name: string; alt: string; eager?: boolean; sizes?: string; className?: string }) {
  return (
    <img
      src={`/product/${name}-1280.jpg`}
      srcSet={`/product/${name}-640.jpg 640w, /product/${name}-1280.jpg 1280w`}
      sizes={sizes}
      alt={alt}
      width="1280"
      height="854"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      className={`cmh-photo ${className}`}
    />
  );
}

function Sculpture({ kind }: { kind: "people" | "calendar" }) {
  const Icon = kind === "people" ? Users : CalendarDays;
  return (
    <div className={`cm-sculpture cm-sculpture-${kind}`} aria-hidden="true">
      <div className="cm-plinth" />
      <div className="cm-sculpture-back" />
      <div className="cm-sculpture-face">
        <Icon strokeWidth={1.25} />
      </div>
      <div className="cm-sculpture-chip">
        <Check size={21} />
      </div>
    </div>
  );
}

const flow = [
  { name: "Contribute", text: "Useful, sourced answers before any ask." },
  { name: "Connect", text: "Remember people, questions and commitments." },
  { name: "Convene", text: "Turn shared needs into real gatherings." },
  { name: "Follow through", text: "Close the loop so trust compounds." },
];

function Index() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.IntersectionObserver || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("cm-revealed");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    root.current?.querySelectorAll(".cm-reveal").forEach((el) => {
      el.classList.add("cm-reveal-ready");
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <SiteLayout>
      <div className="cm-product cmh" ref={root}>
        {/* Hero */}
        <section className="cmh-hero cm-wrap">
          <div className="cmh-hero-copy">
            <p className="cm-eyebrow">Meet your AI Community Steward</p>
            <h1>Every community deserves someone who keeps showing up.</h1>
            <p className="cmh-lede">
              CiviMeet helps your organization understand community needs, prepare helpful contributions,
              coordinate gatherings and follow through — with a person approving every outward step.
            </p>
            <div className="cmh-ctas">
              <Link className="cm-button" to="/auth" search={{ mode: "signup" }}>
                Get started <ArrowRight size={18} />
              </Link>
              <Link className="cm-text-link" to="/product" hash="interactive-demo">
                Explore the interactive demo <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="cmh-hero-art">
            <Photo name="gathering" eager alt="Neighbors sharing a meal around a table in a park" sizes="(max-width: 760px) 100vw, 58vw" />
            <div className="cmh-float cmh-float-a" aria-hidden="true">
              <small>Steward · this week</small>
              <strong>12 recurring questions answered with sources</strong>
              <span className="cmh-float-tag">Illustrative</span>
            </div>
            <div className="cmh-float cmh-float-b" aria-hidden="true">
              <small>Awaiting your approval</small>
              <strong>Saturday resource fair — draft plan</strong>
              <span className="cmh-approve"><Check size={14} /> Review</span>
            </div>
            <div className="cmh-hero-sculpture">
              <Sculpture kind="people" />
            </div>
          </div>
        </section>

        {/* Flow concept */}
        <section className="cmh-flow cm-wrap cm-reveal" aria-label="How the Steward works">
          <ol>
            {flow.map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong>
                <span>{f.text}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Mini demo */}
        <section className="cmh-section cm-wrap cm-reveal" aria-labelledby="demo-h">
          <div className="cmh-head">
            <p className="cm-eyebrow">See your Steward at work</p>
            <h2 id="demo-h">From a quiet signal to a plan worth approving.</h2>
          </div>
          <StewardMiniDemo />
        </section>

        {/* Story */}
        <section className="cmh-story cm-reveal" aria-labelledby="story-h">
          <div className="cm-wrap cmh-story-grid">
            <div className="cmh-story-photos">
              <Photo name="conversation" alt="A group discussing notes around a white table" sizes="(max-width: 760px) 90vw, 40vw" className="cmh-story-a" />
              <Photo name="garden" alt="Volunteers working together in a community garden" sizes="(max-width: 760px) 70vw, 28vw" className="cmh-story-b" />
              <div className="cmh-story-chip" aria-hidden="true">
                <small>Follow-up</small> Thank-you note drafted · 3 new questions logged
              </div>
            </div>
            <div className="cmh-story-copy">
              <p className="cm-eyebrow">From community question to shared experience</p>
              <h2 id="story-h">The work between the meeting and the moment.</h2>
              <p>
                A question in a conversation becomes a sourced answer. Recurring answers reveal a need. A need
                becomes a gathering — a garden day, a resource fair, a forum — and afterward the Steward helps
                you thank people and remember what they asked for next.
              </p>
              <p className="cmh-credit">
                Editorial stock photography via Pexels (incl. Zack Gilbert). Not CiviMeet customers.
              </p>
            </div>
          </div>
        </section>

        {/* Platforms */}
        <section className="cmh-section cm-wrap cm-reveal" aria-labelledby="plat-h">
          <div className="cmh-head">
            <p className="cm-eyebrow">Where your Steward can help</p>
            <h2 id="plat-h">One Steward, honest about every channel.</h2>
            <p>Select a channel to see an example task and exactly what is — and isn’t — supported today.</p>
          </div>
          <PlatformExplorer />
        </section>

        {/* Audience */}
        <section className="cmh-section cmh-audience-wrap cm-wrap cm-reveal" aria-labelledby="aud-h">
          <div className="cmh-head">
            <p className="cm-eyebrow">Built for the people who organize</p>
            <h2 id="aud-h">Made for your kind of community.</h2>
          </div>
          <AudienceSelector />
          <nav className="cmh-all-solutions" aria-label="All solutions">
            <span>All solutions:</span>
            {solutions.map((s) => (
              <Link key={s.slug} to="/solutions/$slug" params={{ slug: s.slug }}>
                {s.name}
              </Link>
            ))}
          </nav>
        </section>

        {/* Oversight */}
        <section className="cmh-trust cm-reveal" aria-labelledby="trust-h">
          <div className="cm-wrap cmh-trust-grid">
            <div>
              <p className="cm-eyebrow">Oversight by design</p>
              <h2 id="trust-h">You stay in charge of everything that leaves the room.</h2>
              <ul className="cmh-trust-list">
                <li><Eye size={18} aria-hidden="true" /> Exact-content approval before anything is sent.</li>
                <li><Lock size={18} aria-hidden="true" /> Bookings and payments need a separate, explicit approval.</li>
                <li><MonitorPlay size={18} aria-hidden="true" /> Supervised browsing of public pages your admins approve.</li>
              </ul>
            </div>
            <div className="cmh-browser" aria-label="Supervised browser preview (UI preview)">
              <div className="cmh-browser-bar">
                <span /><span /><span />
                <em>library.example.org/events</em>
                <b>UI preview</b>
              </div>
              <div className="cmh-browser-view">
                <div className="cmh-shot" />
                <div className="cmh-browser-side">
                  <small>Available now</small>
                  <p>Snapshots and controls on approved public pages</p>
                  <small>Not launched</small>
                  <p>Continuous streaming · login handoff · social automation · unattended runs</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="cmh-close cm-wrap cm-reveal">
          <div className="cmh-close-art"><Sculpture kind="calendar" /></div>
          <h2>Give your community someone who keeps showing up.</h2>
          <div className="cmh-ctas cmh-ctas-center">
            <Link className="cm-button" to="/auth" search={{ mode: "signup" }}>
              Get started <ArrowRight size={18} />
            </Link>
            <Link className="cm-text-link" to="/how-it-works">
              How CiviMeet works <ArrowRight size={16} />
            </Link>
          </div>
          <p className="cmh-pricing">
            Proposed plans start around $250 and $1,000 per month; billing isn’t open yet.{" "}
            <Link to="/pricing">See proposed pricing</Link>
          </p>
        </section>
      </div>
    </SiteLayout>
  );
}
