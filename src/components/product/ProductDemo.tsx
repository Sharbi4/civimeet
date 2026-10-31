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
      "A recurring question becomes a place to contribute. In this illustrative workflow, the Steward brings the need into your workspace.",
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
      "Sourced research helps your team explore resources. These sample source cards are fictional; availability and accessibility still need verification.",
    heading: "Resources worth exploring",
    rows: [
      "[1] Community center · Program directory · Sample source",
      "[2] Parks department · Accessible spaces · Sample source",
      "[3] Neighborhood food truck · Vendor listing · Sample source",
    ],
    outcome: "Research note · Confirm details with each provider",
    icon: Search,
  },
  {
    label: "Prepare",
    title: "Useful words. Your judgment.",
    caption:
      "The Steward prepares a helpful response. Review the wording locally in this demo; nothing is published or sent.",
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
      "Illustrative resident responses help shape an event concept. Automated social listening is a preview, not a connected live service.",
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
      "Compare options and prepare the work. These are sample estimates and proposals—not confirmed bookings, vendor quotes, or financial commitments.",
    heading: "Neighborhood family afternoon",
    rows: [
      "Venue · Community center courtyard · Availability to confirm",
      "Vendor · Local food truck · Quote requested in sample plan",
      "Date · A Saturday next month · Proposed",
      "Budget · $600 working estimate · Approval required",
      "Volunteers · Welcome desk, games, accessibility check",
      "Timeline · Confirm venue → Invite neighbors → Prepare",
    ],
    outcome: "Planning preview · Organization approval required",
    icon: CalendarDays,
  },
  {
    label: "Follow through",
    title: "The event ends. The connection continues.",
    caption:
      "An illustrative operational view connects preparation, participation, feedback, and the next useful step. No real registrations or messages are created.",
    heading: "Keep the relationship going",
    rows: [
      "RSVP coordination · Registration list prepared in sample plan",
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
    <div className="cm-demo" aria-label="Interactive guided demonstration">
      <div className="cm-demo-top">
        <span>
          <img src="/brand/civimeet-mark.svg" width="28" height="28" alt="" /> Community Steward
        </span>
        <span className="cm-label">Illustrative demo · No live actions</span>
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
                ? "Community discussion · Simulation"
                : "CiviMeet / Neighborhood workspace"}
            </span>
            <span className="cm-label">Sample data</span>
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
                  ? "Reviewed in demo · Nothing has been published"
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
