import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  BookOpen,
  Users,
  CalendarDays,
  Layers,
  Pause,
  Search,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AgentVision } from "@/components/product/AgentVision";
import { ProductDemo } from "@/components/product/ProductDemo";
import "@/components/product/product.css";

export const Route = createFileRoute("/product")({
  head: () => ({
    meta: [
      { title: "Your AI Community Steward — CiviMeet" },
      {
        name: "description",
        content:
          "Explore how CiviMeet connects community research, thoughtful engagement, event planning, and follow-through. Try the interactive guided demo.",
      },
      { property: "og:title", content: "Your community, with a Steward. | CiviMeet" },
      {
        property: "og:description",
        content:
          "Contribute. Connect. Meet Up. Follow through. Explore the CiviMeet product experience.",
      },
    ],
  }),
  component: ProductPage,
});
function Photo({ name, alt, eager = false }: { name: string; alt: string; eager?: boolean }) {
  return (
    <img
      src={`/product/${name}-1280.jpg`}
      srcSet={`/product/${name}-640.jpg 640w, /product/${name}-1280.jpg 1280w`}
      sizes="(max-width: 700px) 100vw, 65vw"
      alt={alt}
      width="1280"
      height="854"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      className="cm-photo"
    />
  );
}
function Sculpture({ kind }: { kind: "people" | "knowledge" | "calendar" | "memory" }) {
  const Icon = { people: Users, knowledge: BookOpen, calendar: CalendarDays, memory: Layers }[kind];
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
function Note({
  title,
  children,
  tag = "Illustrative workspace",
}: {
  title: string;
  children: React.ReactNode;
  tag?: string;
}) {
  return (
    <div className="cm-note">
      <small>{tag}</small>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function ProductPage() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("cm-revealed");
            observer.unobserve(entry.target);
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
      <div className="cm-product" ref={root}>
        <section className="cm-hero cm-wrap">
          <p className="cm-eyebrow">Meet your AI Community Steward</p>
          <h1>An AI agent built to grow a community.</h1>
          <div className="cm-hero-intro">
            <p>
              CiviMeet is building a community agent that works on your behalf through an authorized
              browser: developing your social presence, building local relationships, organizing
              events, and coordinating vendors within your approvals and budget. Start from your
              first members or grow the community you already have.
            </p>
            <div className="cm-cta-stack">
              <a className="cm-button" href="#interactive-demo">
                Explore the Interactive Demo <ArrowRight size={18} />
              </a>
              <Link className="cm-text-link" to="/how-it-works">
                See How CiviMeet Works <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="cm-hero-art">
            <Photo
              name="gathering"
              alt="Friends sharing conversation at a picnic table in an autumn park"
              eager
            />
            <div className="cm-photo-caption">Built around people. Connected by purpose.</div>
            <div className="cm-hero-overlay">
              <div className="cm-mini-brand">
                <img src="/brand/civimeet-mark.svg" width="32" height="32" alt="" />
                <span>
                  From a question
                  <br />
                  <strong>to a shared afternoon.</strong>
                </span>
              </div>
              <small>ILLUSTRATIVE WORKSPACE</small>
              <div className="cm-mini-step">
                <Search size={17} />
                <span>Community need identified</span>
              </div>
              <div className="cm-mini-step">
                <BookOpen size={17} />
                <span>Research gathered for review</span>
              </div>
              <div className="cm-mini-step">
                <Check size={17} />
                <span>Helpful response drafted</span>
              </div>
              <div className="cm-mini-step cm-mini-active">
                <CalendarDays size={17} />
                <span>A gathering takes shape</span>
                <ArrowRight size={17} />
              </div>
            </div>
          </div>
        </section>
        <AgentVision />
        <div className="cm-cycle cm-wrap" aria-label="Community stewardship cycle">
          <span>Contribute</span>
          <ArrowRight />
          <span>Connect</span>
          <ArrowRight />
          <span>Meet Up</span>
          <ArrowRight />
          <span>Follow through</span>
          <span className="cm-cycle-return">↺</span>
        </div>
        <section id="interactive-demo" className="cm-demo-section cm-wrap cm-reveal">
          <p className="cm-eyebrow">One question. A world of possibility.</p>
          <h2>See what happens when your community has a Steward.</h2>
          <p className="cm-lede">
            From a neighborhood question to a meaningful gathering, see how CiviMeet connects the
            work that keeps communities moving.
          </p>
          <ProductDemo />
          <p className="cm-fineprint">
            A guided product story with illustrative data and future workflow previews. No account
            needed. No external actions.
          </p>
        </section>
        <section className="cm-capability cm-wrap cm-reveal">
          <div className="cm-cap-copy">
            <p className="cm-eyebrow">Be present</p>
            <h2>Start from zero. Become part of the community.</h2>
            <p>
              Be useful before you ask for attention. Bring your mission, community questions, and
              channel priorities into a workspace that remembers the context.
            </p>
            <ul>
              <li>Research the questions that matter</li>
              <li>Prepare helpful responses in your organization’s voice</li>
              <li>Keep knowledge and activity connected to your team</li>
            </ul>
            <p className="cm-fineprint">
              Platform planning is available. Connected social listening and publishing remain under
              development; channels require authorization.
            </p>
          </div>
          <div className="cm-presence-art">
            <Photo
              name="conversation"
              alt="A group collaborating around a table with notebooks and shared plans"
            />
            <Sculpture kind="people" />
            <Note title="A little context goes a long way.">
              <p>Mission: make the neighborhood more welcoming.</p>
              <div className="cm-chips">
                <span>Family activities</span>
                <span>Accessible spaces</span>
                <span>Local partnerships</span>
              </div>
            </Note>
          </div>
        </section>
        <section className="cm-understand">
          <div className="cm-wrap cm-understand-grid cm-reveal">
            <div className="cm-research-art">
              <div className="cm-research-header">
                <BookOpen size={20} />
                <span>Community knowledge</span>
                <span className="cm-label">Sample workspace</span>
              </div>
              <h3>
                Good decisions start
                <br />
                with better context.
              </h3>
              <div className="cm-research-result">
                <small>RESEARCH / RESOURCES</small>
                <strong>Spaces for a family afternoon</strong>
                <p>Compare access, facilities, and availability before making a recommendation.</p>
                <span className="cm-source">Source references → Human verification</span>
              </div>
              <div className="cm-research-result">
                <small>ORGANIZATIONAL MEMORY</small>
                <strong>Keep what your team learns.</strong>
                <p>Community FAQs, local resources, and past decisions inform the next plan.</p>
              </div>
              <Sculpture kind="knowledge" />
            </div>
            <div className="cm-cap-copy">
              <p className="cm-eyebrow">Understand</p>
              <h2>Turn conversations into understanding.</h2>
              <p>
                Perplexity-powered research puts sources beside the findings. Organizational memory
                gives those findings a home, so useful knowledge can inform the next conversation.
              </p>
              <ul>
                <li>Discover resources with source references</li>
                <li>Keep community FAQs and organizational history</li>
                <li>Surface emerging needs for your team to consider</li>
              </ul>
              <Link className="cm-text-link" to="/how-it-works">
                Explore the approach <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
        <section className="cm-gather cm-wrap cm-reveal">
          <div className="cm-section-heading">
            <div>
              <p className="cm-eyebrow">Bring people together</p>
              <h2>
                From shared interests
                <br />
                to shared experiences.
              </h2>
            </div>
            <p>
              Turn a promising idea into a plan your team can act on. Explore venues and vendors,
              prepare budgets, and give every next step an owner. Commitments stay with people.
            </p>
          </div>
          <div className="cm-gather-art">
            <Photo
              name="garden"
              alt="Volunteers working together with wheelbarrows in a community garden"
            />
            <div className="cm-plan">
              <span className="cm-label">Illustrative planning preview</span>
              <h3>Make room for connection.</h3>
              <div>
                <span>Where</span>
                <strong>Community center courtyard</strong>
              </div>
              <div>
                <span>Who</span>
                <strong>Neighbors, families & volunteers</strong>
              </div>
              <div>
                <span>Partners</span>
                <strong>Local food truck · Quote to confirm</strong>
              </div>
              <div>
                <span>Next</span>
                <strong>Review access, budget & availability</strong>
              </div>
              <p>
                <ShieldCheck size={17} /> Approval before commitments
              </p>
            </div>
            <Sculpture kind="calendar" />
          </div>
          <p className="cm-fineprint">
            Event concepts, vendor research, and task planning support coordination. Automated
            bookings, RSVP operations, and payments are previews—not live actions in this
            demonstration.
          </p>
        </section>
        <section className="cm-momentum cm-wrap cm-reveal">
          <div className="cm-cap-copy">
            <Sculpture kind="memory" />
            <p className="cm-eyebrow">Keep the momentum</p>
            <h2>The gathering is only the beginning.</h2>
            <p>
              Save what you learn, carry unfinished tasks forward, and prepare the next useful
              contribution. Your organization’s history becomes a foundation for deeper
              relationships.
            </p>
          </div>
          <div className="cm-continuity">
            <p className="cm-eyebrow">Illustrative follow-through plan</p>
            <h3>Carry the good forward.</h3>
            {[
              ["Remember", "Save access needs and lessons from the gathering."],
              ["Follow up", "Prepare a thank-you and invite community feedback."],
              ["Understand", "Review participation notes with your team."],
              ["Keep going", "Turn the next shared interest into a planning task."],
            ].map(([title, copy]) => (
              <div className="cm-continuity-row" key={title}>
                <span />
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </div>
            ))}
            <small>Drafts and planning records—not automatically sent follow-ups.</small>
          </div>
        </section>
        <section className="cm-supervision">
          <div className="cm-wrap cm-reveal">
            <div className="cm-section-heading">
              <div>
                <p className="cm-eyebrow">Observable work. Human judgment.</p>
                <h2>
                  See the work.
                  <br />
                  Stay in control.
                </h2>
              </div>
              <p>
                A browser workspace brings the task and its context together. People remain
                responsible for approvals, account access, and sensitive actions.
              </p>
            </div>
            <div className="cm-browser-preview">
              <div className="cm-browser-window">
                <div className="cm-windowbar">
                  <span aria-hidden="true">● ● ●</span>
                  <span>example.com</span>
                  <span>UI preview</span>
                </div>
                <div className="cm-example">
                  <h3>Example Domain</h3>
                  <p>
                    A public-page browser check gives your team a bounded place to observe the
                    workflow.
                  </p>
                  <span>Public-page snapshot</span>
                </div>
                <div className="cm-browser-chat">
                  <img src="/brand/civimeet-mark.svg" alt="" width="28" height="28" />
                  <p>
                    <strong>Community Action Agent</strong>
                    <br />
                    Review the page in context. Keep the conversation below the browser.
                  </p>
                  <span>
                    <Pause size={14} /> Pause
                  </span>
                </div>
              </div>
              <div className="cm-browser-status">
                <h3>A clear view of what’s ready.</h3>
                <div>
                  <span className="cm-label">Available now</span>
                  <p>
                    Controlled public-page sessions, refreshed snapshots, pause/stop controls, and
                    expandable activity history.
                  </p>
                </div>
                <div>
                  <span className="cm-label">In development</span>
                  <p>
                    Continuous streaming, private-account login and takeover, connected social
                    operations, and unattended execution.
                  </p>
                </div>
                <Link className="cm-text-link" to="/dashboard">
                  Explore your workspace <ArrowRight size={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section className="cm-trust cm-wrap cm-reveal">
          <ShieldCheck size={36} strokeWidth={1.2} />
          <p className="cm-eyebrow">Responsibility, by design</p>
          <h2>Built for organizations that take responsibility seriously.</h2>
          <div className="cm-trust-grid">
            <div>
              <h3>Your organization’s context</h3>
              <p>
                Separate workspaces and organization-scoped data keep knowledge connected to the
                right team.
              </p>
            </div>
            <div>
              <h3>People set the boundaries</h3>
              <p>
                Role-based access, controlled browser sessions, and approval checkpoints support
                human oversight.
              </p>
            </div>
            <div>
              <h3>A record you can revisit</h3>
              <p>
                Source references and activity records make research and workspace actions easier to
                review.
              </p>
            </div>
          </div>
        </section>
        <section className="cm-final cm-wrap">
          <p className="cm-eyebrow">Attention becomes connection.</p>
          <h2>
            Stronger communities
            <br />
            don’t happen by accident.
          </h2>
          <p>
            They grow through attention, useful contributions, thoughtful coordination, and
            consistent follow-through. CiviMeet brings that work into one intelligent workspace.
          </p>
          <div className="cm-final-actions">
            <Link className="cm-button" to="/auth">
              Experience CiviMeet <ArrowRight size={18} />
            </Link>
            <Link className="cm-text-link" to="/dashboard">
              Explore the Dashboard <ArrowRight size={17} />
            </Link>
          </div>
          <div className="cm-credits">
            Editorial stock photography, not CiviMeet customer events. Photos:{" "}
            <a href="https://www.pexels.com/photo/people-sitting-at-the-table-in-the-park-9655048/">
              gathering
            </a>
            ,{" "}
            <a href="https://www.pexels.com/photo/a-group-of-people-discussing-notes-on-a-white-table-6592644/">
              collaboration
            </a>
            ,{" "}
            <a href="https://www.pexels.com/photo/community-gardening-project-in-bloomington-39778110/">
              community garden
            </a>{" "}
            via Pexels.
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
