import { Link } from "@tanstack/react-router";
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

function CommunityPossibilities() {
  return (
    <section className="cmc-moments cmc-wrap" aria-labelledby="cmc-moments-title">
      <div className="cmc-moments-copy">
        <p className="cmc-eyebrow">The groundwork for something good</p>
        <h2 id="cmc-moments-title">Make room for the moments that matter.</h2>
        <p>
          A neighbor who feels welcome. A partner who shares your purpose. An idea that finally
          brings everyone together.
        </p>
        <p>
          CiviMeet helps turn the research, planning, and invitation drafts into a starting point
          your team can build on.
        </p>
        <Link to="/demo" className="cmc-more">
          Picture your next gathering <ArrowRight size={17} />
        </Link>
      </div>
      <article className="cmc-moment-card" aria-label="Example community event plan">
        <div className="cmc-moment-label">
          <CalendarDays size={18} />
          <span>One idea. A place to begin.</span>
          <small>Example</small>
        </div>
        <h3>“Let’s bring the neighborhood together.”</h3>
        <p>From a first thought to a plan you can shape.</p>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Find your people</strong>
              <p>Local partners and vendors, with sources.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Give the idea a home</strong>
              <p>Venue options and a gathering proposal.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Make the invitation count</strong>
              <p>A thoughtful draft, ready for your review.</p>
            </div>
          </li>
        </ol>
        <div className="cmc-moment-footer">
          <ShieldCheck size={16} /> Your community. Your voice. Your final say.
        </div>
      </article>
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
        <CommunityPossibilities />
        <section className="cmc-answers cmc-wrap" aria-labelledby="home-questions">
          <div>
            <p className="cmc-eyebrow">Before your first gathering</p>
            <h2 id="home-questions">
              Big possibilities. <br />
              Clear answers.
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
