import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Compass,
  Globe2,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { solutions } from "@/lib/site-content";

const platforms = [
  {
    id: "web",
    label: "Public web",
    icon: Globe2,
    status: "Supervised browser foundation",
    title: "Discover what your community needs.",
    description:
      "Research public resources, compare locations, and capture sources in a reviewable browser workspace.",
    actions: [
      "Explore local resources",
      "Compare venues and accessibility",
      "Build a source-backed brief",
    ],
    note: "Browser infrastructure exists; live streaming and login takeover are still being verified.",
  },
  {
    id: "facebook",
    label: "Facebook Pages",
    icon: MessageCircle,
    status: "Planned connection",
    title: "Be consistently useful on your Page.",
    description:
      "Plan clear updates and prepare responses to community questions in your organization's voice.",
    actions: ["Draft resource posts", "Prepare responses for approval", "Plan event announcements"],
    note: "No connected listening or publishing yet. Authorization and human review are required.",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: HeartHandshake,
    status: "Planned connection",
    title: "Turn moments into lasting connection.",
    description:
      "Prepare community stories, outreach campaigns and event recaps before your team publishes.",
    actions: ["Outline visual campaigns", "Draft community spotlights", "Prepare event reminders"],
    note: "This is a workflow concept, not a live Instagram integration.",
  },
  {
    id: "events",
    label: "Eventbrite",
    icon: CalendarDays,
    status: "Planned connection",
    title: "Bring a gathering from idea to plan.",
    description:
      "Organize event descriptions, registration needs, accessibility details and check-in plans.",
    actions: [
      "Prepare an event brief",
      "Map registration needs",
      "Outline volunteers and check-in",
    ],
    note: "External event creation and registration are not connected yet.",
  },
  {
    id: "nextdoor",
    label: "Nextdoor",
    icon: Users,
    status: "Platform-dependent concept",
    title: "Help neighbors find common ground.",
    description:
      "Develop useful neighborhood content and local outreach plans where participation is permitted.",
    actions: [
      "Plan neighborhood updates",
      "Prepare helpful answers",
      "Draft gathering invitations",
    ],
    note: "Subject to platform permissions. No automated posting or listening is available.",
  },
  {
    id: "discussion",
    label: "Reddit & X",
    icon: Compass,
    status: "Platform-dependent concept",
    title: "Participate thoughtfully, with context.",
    description:
      "Research public conversations and prepare source-backed, clearly identified contributions for review.",
    actions: ["Research public topics", "Prepare cited responses", "Review community guidelines"],
    note: "No connected account actions. Rules, permissions and approvals apply.",
  },
] as const;

export function PlatformExplorer() {
  const [selected, setSelected] = useState<(typeof platforms)[number]["id"]>("web");
  const active = platforms.find((platform) => platform.id === selected) ?? platforms[0];
  const Icon = active.icon;
  return (
    <div className="cmh-platform">
      <div className="cmh-platform-nav" aria-label="Platform workflow examples">
        {platforms.map((platform) => {
          const PlatformIcon = platform.icon;
          return (
            <button
              key={platform.id}
              type="button"
              aria-pressed={selected === platform.id}
              onClick={() => setSelected(platform.id)}
            >
              <PlatformIcon size={20} aria-hidden="true" />
              <span>{platform.label}</span>
              <ArrowUpRight size={16} className="cmh-platform-arrow" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="cmh-platform-stage" aria-live="polite">
        <div className="cmh-platform-stage-heading">
          <span className="cmh-pill">
            <span className="cmh-pill-dot" /> {active.status}
          </span>
          <span className="cmh-platform-preview-tag">INTERACTIVE PREVIEW</span>
        </div>
        <div className="cmh-platform-content" key={active.id}>
          <div className="cmh-platform-description">
            <div className="cmh-platform-icon">
              <Icon size={31} strokeWidth={1.6} />
            </div>
            <h3>{active.title}</h3>
            <p>{active.description}</p>
          </div>
          <div className="cmh-platform-screen">
            <div className="cmh-screen-top">
              <span className="cmh-screen-dots">
                <i />
                <i />
                <i />
              </span>
              <span>CiviMeet / Steward workspace</span>
              <LockKeyhole size={14} />
            </div>
            <div className="cmh-screen-body">
              <div className="cmh-screen-label">
                <BookOpen size={17} /> COMMUNITY ACTION PLAN <span>Sample data</span>
              </div>
              {active.actions.map((action, index) => (
                <div className="cmh-screen-task" key={action}>
                  <span>0{index + 1}</span>
                  <strong>{action}</strong>
                  <CheckCircle2 size={18} />
                </div>
              ))}
              <div className="cmh-screen-approval">
                <ShieldCheck size={18} /> Prepared for your team's review <ArrowRight size={17} />
              </div>
            </div>
          </div>
        </div>
        <p className="cmh-platform-footnote">
          <LockKeyhole size={16} aria-hidden="true" /> {active.note}
        </p>
      </div>
    </div>
  );
}

export function AudienceExplorer() {
  const [selected, setSelected] = useState(solutions[0]!.slug);
  const active = solutions.find((solution) => solution.slug === selected) ?? solutions[0]!;
  return (
    <div className="cmh-audience">
      <div className="cmh-audience-options" aria-label="Choose your organization type">
        {solutions.map((solution) => (
          <button
            key={solution.slug}
            type="button"
            aria-pressed={selected === solution.slug}
            onClick={() => setSelected(solution.slug)}
          >
            {solution.name}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="cmh-audience-detail" aria-live="polite">
        <p className="cmh-kicker">A STEWARD FOR YOUR MISSION</p>
        <h3>{active.name}</h3>
        <p>{active.summary}</p>
        <ul>
          {active.points.map((point) => (
            <li key={point}>
              <CheckCircle2 size={19} aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <Link to="/solutions/$slug" params={{ slug: active.slug }} className="cmh-strong-link">
          Explore {active.name.toLowerCase()} <ArrowUpRight size={20} />
        </Link>
      </div>
    </div>
  );
}
