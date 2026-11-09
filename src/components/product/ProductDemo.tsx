import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Check,
  Search,
  MessageCircle,
  CalendarDays,
  Users,
  ArrowUpRight,
} from "lucide-react";

const scenes = [
  {
    label: "Listen",
    title: "A community need emerges",
    caption:
      "Explore how a recurring community question becomes a research task for your Steward.",
    heading: "More ways to spend time together",
    rows: [
      "Resident · Are there any accessible activities for families nearby?",
      "Resident · Something affordable, with room for younger children?",
      "Resident · We'd love to meet other neighbors.",
    ],
    outcome: "Community need · Accessible family activities",
    icon: MessageCircle,
  },
  {
    label: "Research",
    title: "A stronger starting point",
    caption:
      "Civi researches resources and prepares source references for review. Confirm availability and accessibility with each provider.",
    heading: "Resources worth exploring",
    rows: [
      "Research task · Check community center program directories",
      "Research task · Check parks department accessibility information",
      "Research task · Find local food truck vendor listings",
    ],
    outcome: "Research note · Confirm details with each provider",
    icon: Search,
  },
  {
    label: "Prepare",
    title: "Useful words. Your judgment.",
    caption:
      "The Steward drafts a helpful response. Your team reviews and approves the exact wording before anything is published or sent.",
    heading: "A response for your community",
    rows: [
      "We’re exploring an accessible, low-cost family afternoon in the neighborhood.",
      "Would a weekend gathering with games and a local food truck be useful?",
      "Tell us what would help your family take part.",
    ],
    outcome: "Draft · Awaiting your review",
    icon: MessageCircle,
  },
  {
    label: "Connect",
    title: "Shared interest becomes a possibility",
    caption:
      "Use community input your team brings into the workspace to shape an event concept. Civi helps organize needs and prepare next steps.",
    heading: "An afternoon built around people",
    rows: [
      "Shared interest · A welcoming place for families",
      "Access need · Step-free entry and a quiet space",
      "Suggested concept · Neighborhood family afternoon",
    ],
    outcome: "Opportunity · Move the idea into a plan",
    icon: Users,
  },
  {
    label: "Plan",
    title: "Give a good idea a practical plan",
    caption:
      "Compare options and prepare the work. Confirm estimates and provider details, then obtain approval before booking or paying.",
    heading: "Neighborhood family afternoon",
    rows: [
      "Venue · Community center courtyard · Availability to confirm",
      "Vendor · Local food truck · Request a quote after approval",
      "Date · A Saturday next month · To confirm",
      "Budget · $600 working estimate · Approval required",
      "Volunteers · Welcome desk, games, accessibility check",
      "Timeline · Confirm venue → Invite neighbors → Prepare",
    ],
    outcome: "Event plan · Organization approval required",
    icon: CalendarDays,
  },
  {
    label: "Follow through",
    title: "The event ends. The connection continues.",
    caption:
      "Prepare registration checklists, volunteer assignments, and follow-up drafts in one place. Your team approves messages before they are sent.",
    heading: "Keep the relationship going",
    rows: [
      "RSVP coordination · Prepare a registration checklist",
      "Volunteer assignments · Welcome team and activity hosts",
      "Event preparation · Access checklist ready for review",
      "Follow-up · Thank-you message drafted",
      "Community feedback · Ask what neighbors would like next",
      "Organizational memory · Save lessons for the next gathering",
    ],
    outcome: "Next opportunity · Build on what the community shares",
    icon: Check,
  },
];

export function ProductDemo() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (scene === scenes.length - 1) setPlaying(false);
      else setScene(scene + 1);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [playing, scene]);
  const select = (index: number) => {
    setScene(index);
    setPlaying(false);
  };
  const current = scenes[scene] ?? scenes[0]!;
  const Icon = current.icon;
  return (
    <div className="cm-demo" aria-label="Guided product tour">
      <div className="cm-demo-top">
        <span>
          <img src="/brand/civimeet-mark.svg" width="28" height="28" alt="" /> Community Steward
        </span>
        <span className="cm-label">Product tour · Your team stays in control</span>
      </div>
      <div className="cm-demo-layout">
        <nav className="cm-scenes" aria-label="Walkthrough scenes">
          {scenes.map((item, index) => (
            <button
              key={item.label}
              aria-current={scene === index ? "step" : undefined}
              onClick={() => select(index)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {scene === index && <ArrowRight size={15} />}
            </button>
          ))}
          <p>
            One community.
            <br />A continuous thread of care.
          </p>
        </nav>
        <div className="cm-demo-stage">
          <div className="cm-windowbar">
            <span className="cm-windowdots" aria-hidden="true">
              ● ● ●
            </span>
            <span>
              {scene === 0
                ? "Example: Community discussion"
                : "CiviMeet / Neighborhood workspace"}
            </span>
            <span className="cm-label">Example: Family afternoon</span>
          </div>
          <div
            key={scene}
            className={`cm-scene-content cm-scene-${scene} ${playing ? "is-playing" : ""}`}
          >
            <div className="cm-scene-heading">
              <span className="cm-icon-tile">
                <Icon size={24} />
              </span>
              <div>
                <small>{current.title}</small>
                <h3>{current.heading}</h3>
              </div>
            </div>
            <div className="cm-scene-rows">
              {current.rows.map((row, i) => (
                <div className="cm-scene-row" key={row} style={{ animationDelay: `${i * 110}ms` }}>
                  <span className="cm-row-dot" />
                  {row}
                </div>
              ))}
            </div>
            <div className="cm-outcome">
              <ArrowUpRight size={19} />
              <span>
                {scene === 2 && reviewed
                  ? "Draft review selected · Not published"
                  : current.outcome}
              </span>
              {scene === 2 && (
                <button onClick={() => setReviewed(!reviewed)}>
                  {reviewed ? "Edit review" : "Review draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="cm-demo-footer">
        <div aria-live="polite">
          <strong>{current.title}</strong>
          <p>{current.caption}</p>
        </div>
        <div className="cm-playback">
          <button
            aria-label="Previous scene"
            disabled={scene === 0}
            onClick={() => select(scene - 1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
            onClick={() => {
              if (scene === 5) setScene(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button aria-label="Next scene" disabled={scene === 5} onClick={() => select(scene + 1)}>
            <ArrowRight size={18} />
          </button>
          <span>{scene + 1} / 6</span>
        </div>
      </div>
      <div
        className="cm-progress"
        role="progressbar"
        aria-label="Walkthrough progress"
        aria-valuemin={1}
        aria-valuemax={6}
        aria-valuenow={scene + 1}
      >
        <span
          style={{ width: `${((scene + 1) / 6) * 100}%`, transition: reduced ? "none" : undefined }}
        />
      </div>
    </div>
  );
}
