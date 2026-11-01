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
import { AgentVision } from "@/components/product/AgentVision";
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

export function CompactHome() {
  return (
    <SiteLayout>
      <div className="cm-compact">
        <section className="cmc-hero cmc-wrap" aria-labelledby="home-title">
          <div className="cmc-copy">
            <p className="cmc-eyebrow">Contribute. Connect. Meet Up.</p>
            <h1 id="home-title">
              Start a community.
              <br />
              <span>Give it momentum.</span>
            </h1>
            <p className="cmc-intro">
              Meet the AI agent we’re building to grow your community: working in your connected
              accounts, building your social presence, and bringing people together through events.
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
                <ShieldCheck size={15} /> Your mission. Your accounts. Your approval.
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
              <h2>Become a familiar presence.</h2>
              <p>
                The vision: helpful posts, conversations, and outreach in your organization’s voice.
              </p>
            </div>
          </article>
          <article>
            <CalendarDays size={22} />
            <div>
              <h2>Turn connection into a gathering.</h2>
              <p>
                From vendor discovery to invitations and follow-through, bring the event work
                together.
              </p>
            </div>
          </article>
          <article>
            <MessageCircle size={22} />
            <div>
              <h2>Give your agent a direction.</h2>
              <p>Set the mission, channels, and boundaries. Review the work from one workspace.</p>
            </div>
          </article>
        </section>
        <AgentVision compact />
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
