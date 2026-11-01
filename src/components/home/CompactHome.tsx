import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  MessageCircle,
  Play,
  Search,
  ShieldCheck,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StewardMiniDemo } from "./HomeInteractive";
import "./home-premium.css";
import "./home-compact.css";

// BLS median hourly wage for U.S. meeting, convention and event planners (May 2025).
// A scenario input is not a claim that CiviMeet has measured these savings.
const PLANNER_HOURLY_WAGE = 29.41;

export function PlanningTimeScenario() {
  const [hoursPerEvent, setHoursPerEvent] = useState(5);
  const [eventsPerMonth, setEventsPerMonth] = useState(2);
  const hours = hoursPerEvent * eventsPerMonth;
  const value = Math.round(hours * PLANNER_HOURLY_WAGE);
  return (
    <section className="cmc-time cmc-wrap" aria-labelledby="cmc-time-title">
      <div className="cmc-time-intro">
        <p className="cmc-eyebrow">Time back for your mission</p>
        <h2 id="cmc-time-title">What could fewer planning hours mean?</h2>
        <p>
          CiviMeet helps prepare venue research, vendor comparisons, event plans and outreach
          drafts. Explore the value of time your team <em>might</em> reclaim.
        </p>
        <Link to="/product" className="cmc-more">
          See how the organizer helps <ArrowRight size={16} />
        </Link>
      </div>
      <div className="cmc-time-card">
        <div className="cmc-time-controls">
          <label htmlFor="planning-hours">
            Hours reclaimed per event <strong>{hoursPerEvent}</strong>
          </label>
          <input
            id="planning-hours"
            type="range"
            min={1}
            max={12}
            value={hoursPerEvent}
            onChange={(event) => setHoursPerEvent(Number(event.target.value))}
          />
          <label htmlFor="planning-events">
            Events each month <strong>{eventsPerMonth}</strong>
          </label>
          <input
            id="planning-events"
            type="range"
            min={1}
            max={8}
            value={eventsPerMonth}
            onChange={(event) => setEventsPerMonth(Number(event.target.value))}
          />
        </div>
        <div className="cmc-time-result" aria-live="polite">
          <strong>{hours} hours</strong>
          <span>potential staff time per month</span>
          <strong>${value.toLocaleString("en-US")}</strong>
          <span>equivalent labor value at $29.41/hour</span>
        </div>
        <p className="cmc-time-note">
          Illustrative scenario, not measured CiviMeet savings or guaranteed cash savings. Assumes
          the hours you select can be reclaimed. Labor benchmark:{" "}
          <a
            href="https://www.bls.gov/ooh/business-and-financial/meeting-convention-and-event-planners.htm"
            target="_blank"
            rel="noopener noreferrer"
          >
            U.S. BLS, May 2025 median event-planner pay
          </a>
          . Does not deduct subscription or AI usage costs.
        </p>
      </div>
    </section>
  );
}

export function CompactHome() {
  return (
    <SiteLayout>
      <div className="cm-compact">
        <section className="cmc-hero cmc-wrap" aria-labelledby="home-title">
          <div className="cmc-copy">
            <p className="cmc-eyebrow">Contribute. Connect. Meet Up.</p>
            <h1 id="home-title">
              Bring people together.
              <br />
              <span>Let AI do the groundwork.</span>
            </h1>
            <p className="cmc-intro">
              Your AI community organizer finds local partners, drafts useful updates, and helps you
              plan events—all in one workspace.
            </p>
            <p className="cmc-audience">
              For nonprofits, neighborhood groups, and membership organizations.
            </p>
            <div className="cmc-actions">
              <Link to="/get-started" className="cmc-primary">
                Request a demo <ArrowRight size={17} />
              </Link>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="cmc-demo-button">
                    <Play size={15} /> See how it works
                  </button>
                </DialogTrigger>
                <DialogContent className="cm-home cm-quick-demo">
                  <DialogTitle>See your Community Steward at work</DialogTitle>
                  <DialogDescription>
                    Choose a task to explore. This is an illustrative demo; no messages, bookings,
                    or account actions occur.
                  </DialogDescription>
                  <StewardMiniDemo />
                  <Link to="/demo" className="cmc-more">
                    Try the full dashboard demo <ArrowRight size={16} />
                  </Link>
                </DialogContent>
              </Dialog>
            </div>
            <div className="cmc-decision">
              <span>
                <ShieldCheck size={15} /> AI prepares. Your team decides.
              </span>
              <Link to="/pricing">Proposed plans from $250/month →</Link>
            </div>
          </div>
          <div className="cmc-visual">
            <img
              src="/product/gathering-1280.jpg"
              srcSet="/product/gathering-640.jpg 640w, /product/gathering-1280.jpg 1280w"
              sizes="(max-width: 700px) 100vw, 45vw"
              width={1280}
              height={853}
              fetchPriority="high"
              alt="Friends talking around a picnic table in an autumn park"
            />
            <div className="cmc-preview">
              <div className="cmc-preview-head">
                <img src="/brand/civimeet-mark.svg" width={28} height={28} alt="" />
                <strong>A neighborhood afternoon</strong>
                <span>Example</span>
              </div>
              <p>
                <Check size={15} /> Local partners researched
              </p>
              <p>
                <Check size={15} /> Gathering proposal prepared
              </p>
              <p>
                <MessageCircle size={15} /> Invitation draft ready to review
              </p>
            </div>
          </div>
        </section>
        <section className="cmc-outcomes cmc-wrap" aria-label="What CiviMeet helps you do">
          <article>
            <Search size={22} />
            <div>
              <h2>Find the right local partners.</h2>
              <p>Research vendors, venues, and resources with sources you can check.</p>
            </div>
          </article>
          <article>
            <CalendarDays size={22} />
            <div>
              <h2>Turn an idea into a plan.</h2>
              <p>Prepare gathering proposals, practical next steps, and follow-up.</p>
            </div>
          </article>
          <article>
            <MessageCircle size={22} />
            <div>
              <h2>Give people a reason to join.</h2>
              <p>Draft useful updates and invitations in your organization’s voice.</p>
            </div>
          </article>
        </section>
        <PlanningTimeScenario />
        <section className="cmc-answers cmc-wrap" aria-labelledby="home-questions">
          <div>
            <p className="cmc-eyebrow">A few useful details</p>
            <h2 id="home-questions">
              Less admin. <br />
              More community.
            </h2>
            <Link to="/product" className="cmc-more">
              Explore the full product <ArrowRight size={16} />
            </Link>
          </div>
          <div className="cmc-faq">
            <details>
              <summary>What can I use today?</summary>
              <p>
                Sourced Perplexity research, local vendor discovery, organization knowledge, event
                planning, and platform-specific drafts. Your team reviews vendor details and plans
                before using them.
              </p>
              <Link to="/product">See the product walkthrough →</Link>
            </details>
            <details>
              <summary>Does it work with our social platforms?</summary>
              <p>
                You can plan content for Facebook, Instagram, X, Reddit, Nextdoor, and Eventbrite.
                Connected account login, monitoring, and publishing are still in development.
                Public-web research is available now.
              </p>
            </details>
            <details>
              <summary>What happens when we get started?</summary>
              <p>
                Tell us your organization, location, and goals through the demo request form. We’ll
                help you explore the fit. Proposed pricing is published separately; requesting a
                demo does not start a paid subscription.
              </p>
              <Link to="/get-started">Request a demo →</Link>
            </details>
          </div>
        </section>
        <p className="cmc-credit cmc-wrap">
          Editorial photography via Pexels. People pictured are not CiviMeet customers.
        </p>
      </div>
    </SiteLayout>
  );
}
