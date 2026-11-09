import { Link } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  FileText,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  MessageCircle,
  Monitor,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Search,
  Settings,
  Shapes,
  SquarePen,
  Target,
  Users,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";

export type RailView =
  | "chat"
  | "search"
  | "feed"
  | "ideas"
  | "goals"
  | "events"
  | "library"
  | "approvals"
  | "connectors"
  | "browser"
  | "dashboard"
  | "people"
  | "activity";
type Icon = ComponentType<{ size?: number; className?: string }>;
/** Always-visible workspace places, ChatGPT-style: few, quiet, below the conversations. */
export const primaryViews: [RailView, string, Icon][] = [
  ["chat", "Chat", MessageCircle],
  ["search", "Search", Search],
  ["approvals", "Approvals", Inbox],
  ["events", "Events", CalendarDays],
  ["library", "Library", Shapes],
];
/** Everything else stays one click away under "More". */
export const workspaceViews: [RailView, string, Icon][] = [
  ["feed", "Feed", Newspaper],
  ["ideas", "Ideas", Lightbulb],
  ["goals", "Goals", Target],
  ["people", "People", Users],
  ["dashboard", "Overview", LayoutDashboard],
  ["activity", "Activity", Activity],
  ["connectors", "Settings", Settings],
];
export const railViews = [...primaryViews, ...workspaceViews];

export type RailChat = { id: string; label: string; connector?: string; status?: string };
export type RailArtifact = { id: string; title: string; kind: string };

const artifactIcon = (kind: string): Icon =>
  kind === "payment"
    ? Receipt
    : kind === "booking"
      ? CalendarDays
      : kind === "research"
        ? Search
        : FileText;

const statusDot = (status?: string) =>
  status === "paused" || status === "needs_attention"
    ? "bg-warning"
    : status === "working"
      ? "bg-primary animate-pulse"
      : "bg-success";

export function WorkspaceRail({
  view,
  onNavigate,
  expanded,
  onToggle,
  organization,
  area,
  pending,
  chats,
  topics,
  activeChat,
  onChat,
  recent,
  onArtifact,
  onIdentity,
  onNewChat,
  footer,
}: {
  view: RailView;
  onNavigate: (view: RailView) => void;
  expanded: boolean;
  onToggle: () => void;
  organization: string;
  area: string;
  pending: number;
  chats: RailChat[];
  topics: RailChat[];
  activeChat: string;
  onChat: (id: string) => void;
  recent: RailArtifact[];
  onArtifact: (artifact: RailArtifact) => void;
  onIdentity: () => void;
  onNewChat?: (() => void) | undefined;
  footer: { title: string; detail: string };
}) {
  const [more, setMore] = useState(() => workspaceViews.some(([id]) => id === view));
  const main = chats.find((chat) => !chat.connector);
  const helpers = chats.filter((chat) => chat.connector);
  const initials = organization
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("");

  const item = (id: RailView, label: string, Icon: Icon) => {
    const active = view === id;
    return (
      <button
        key={id}
        type="button"
        aria-label={label}
        title={expanded ? undefined : label}
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(id)}
        className={`cv-rail-item ${active ? "cv-rail-item-active" : ""} ${expanded ? "" : "cv-rail-item-icon"}`}
      >
        <Icon size={17} className="shrink-0" />
        {expanded && <span className="truncate">{label}</span>}
        {id === "approvals" && pending > 0 && (
          <i className={`cv-rail-badge ${expanded ? "ml-auto" : "absolute right-1 top-1"}`}>
            {pending}
          </i>
        )}
      </button>
    );
  };
  const chatButton = (chat: RailChat, small = false) => {
    const active = view === "chat" && activeChat === chat.id;
    return (
      <button
        key={chat.id}
        type="button"
        aria-label={chat.label}
        title={expanded ? undefined : chat.label}
        aria-pressed={active}
        onClick={() => onChat(chat.id)}
        className={`cv-rail-item ${small ? "cv-rail-item-small" : ""} ${active ? "cv-rail-item-active" : ""} ${expanded ? "" : "cv-rail-item-icon"}`}
      >
        {chat.connector ? (
          <span className="relative shrink-0">
            <BrandLogo id={chat.connector} size={20} className="!rounded-[6px]" />
            <i
              aria-hidden="true"
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background ${statusDot(chat.status)}`}
            />
          </span>
        ) : small ? (
          <span className="cv-rail-hash" aria-hidden="true">
            #
          </span>
        ) : (
          <span className="cv-civi-avatar h-5 w-5" aria-hidden="true">
            <img src="/brand/civimeet-mark.svg" alt="" className="h-3 w-3 brightness-0 invert" />
          </span>
        )}
        {expanded && <span className="truncate">{chat.label}</span>}
      </button>
    );
  };

  return (
    <nav
      aria-label="Organizer workspace"
      className={`cv-rail ${expanded ? "w-[268px] px-3" : "w-[68px] px-2"}`}
    >
      <div
        className={`flex items-center pb-2 pt-3 ${expanded ? "justify-between px-1" : "flex-col gap-2"}`}
      >
        <Link to="/" aria-label="CiviMeet home" className="flex items-center gap-2 rounded-lg p-1">
          <img src="/brand/civimeet-mark.svg" alt="" className="h-7 w-7" />
          {expanded && (
            <b className="text-[16px] font-semibold tracking-tight text-foreground">CiviMeet</b>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </div>

      <div className="space-y-0.5 pb-2">
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            aria-label="New chat"
            title={expanded ? undefined : "New chat"}
            className={`cv-rail-item ${expanded ? "" : "cv-rail-item-icon"}`}
          >
            <SquarePen size={17} className="shrink-0" />
            {expanded && <span>New chat</span>}
          </button>
        )}
        {primaryViews.filter(([id]) => id !== "chat").map(([id, label, Icon]) => item(id, label, Icon))}
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
        {main && <div className="pb-1">{chatButton(main)}</div>}

        {expanded && <p className="cv-rail-label">Helpers</p>}
        <div className="space-y-0.5">
          {helpers.map((chat) => chatButton(chat))}
          <button
            type="button"
            onClick={() => onNavigate("connectors")}
            aria-label="Connect an account"
            title={expanded ? undefined : "Connect an account"}
            className={`cv-rail-item cv-rail-item-quiet ${expanded ? "" : "cv-rail-item-icon"}`}
          >
            <Plus size={16} className="shrink-0" />
            {expanded && (
              <span className="truncate">
                {helpers.length ? "Connect another account" : "Connect an account"}
              </span>
            )}
          </button>
        </div>

        {expanded && topics.length > 0 && (
          <>
            <p className="cv-rail-label">Projects</p>
            <div className="space-y-0.5">{topics.map((topic) => chatButton(topic, true))}</div>
          </>
        )}

        {expanded && recent.length > 0 && (
          <>
            <p className="cv-rail-label">Made by Civi</p>
            <div className="space-y-0.5">
              {recent.map((artifact) => {
                const Icon = artifactIcon(artifact.kind);
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => onArtifact(artifact)}
                    className="cv-rail-item cv-rail-item-small"
                  >
                    <Icon size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{artifact.title}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="pt-3">
          {expanded ? (
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((open) => !open)}
              className="cv-rail-label flex w-full items-center justify-between !pt-1 hover:text-foreground"
            >
              More <ChevronDown size={13} className={more ? "rotate-180" : ""} />
            </button>
          ) : null}
          {(more || !expanded) && (
            <div className="space-y-0.5">
              {workspaceViews
                .filter(([id]) => id !== "connectors")
                .map(([id, label, Icon]) => item(id, label, Icon))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border py-2.5">
        <div className={`flex items-center gap-1 ${expanded ? "" : "flex-col"}`}>
          <button
            type="button"
            onClick={onIdentity}
            aria-label="Organization identity"
            title={expanded ? undefined : organization}
            className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-muted ${expanded ? "" : "justify-center"}`}
          >
            <span className="cv-org-avatar">{initials}</span>
            {expanded && (
              <span className="min-w-0">
                <b className="block truncate text-[13px] font-semibold text-foreground">
                  {organization}
                </b>
                <small className="block truncate text-[11px] capitalize text-muted-foreground">
                  {area || footer.detail} · {footer.title}
                </small>
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            aria-current={view === "connectors" ? "page" : undefined}
            onClick={() => onNavigate("connectors")}
            className={`rounded-lg p-2 transition-colors hover:bg-muted ${view === "connectors" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <Settings size={17} />
          </button>
        </div>
      </div>
    </nav>
  );
}
