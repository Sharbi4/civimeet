import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import {
  Activity,
  CalendarDays,
  FileText,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Link2,
  MessageCircle,
  Monitor,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Search,
  Shapes,
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
export const primaryViews: [RailView, string, Icon][] = [
  ["chat", "Chat", MessageCircle],
  ["search", "Search", Search],
  ["feed", "Feed", Newspaper],
  ["ideas", "Ideas", Lightbulb],
  ["goals", "Goals", Target],
  ["events", "Events", CalendarDays],
  ["library", "Library", Shapes],
];
export const workspaceViews: [RailView, string, Icon][] = [
  ["approvals", "Approvals", Inbox],
  ["connectors", "Connections", Link2],
  ["browser", "Live browser", Monitor],
  ["dashboard", "Overview", LayoutDashboard],
  ["people", "People", Users],
  ["activity", "Activity", Activity],
];
export const railViews = [...primaryViews, ...workspaceViews];

export type RailChat = { id: string; label: string; connector?: string };
export type RailArtifact = { id: string; title: string; kind: string };

const artifactIcon = (kind: string): Icon =>
  kind === "payment"
    ? Receipt
    : kind === "booking"
      ? CalendarDays
      : kind === "research"
        ? Search
        : FileText;

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
  footer: { title: string; detail: string };
}) {
  const item = (id: RailView, label: string, Icon: Icon, compact = false) => {
    const active = view === id;
    return (
      <button
        key={id}
        type="button"
        aria-label={label}
        title={expanded ? undefined : label}
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(id)}
        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 transition-colors ${
          compact ? "h-9 text-[13px]" : "h-11 text-[14px]"
        } ${
          active
            ? "bg-[#edf3ff] font-semibold text-[#0640d4]"
            : "text-[#5d6c7c] hover:bg-slate-50 hover:text-[#142d40]"
        } ${expanded ? "" : "justify-center px-0"}`}
      >
        <Icon size={compact ? 18 : 20} className="shrink-0" />
        {expanded && <span className="truncate">{label}</span>}
        {id === "approvals" && pending > 0 && (
          <i
            className={`rounded-full bg-[#d97706] px-1.5 text-[10px] font-semibold not-italic leading-5 text-white ${
              expanded ? "ml-auto" : "absolute right-1.5 top-1"
            }`}
          >
            {pending}
          </i>
        )}
      </button>
    );
  };
  const chatButton = (chat: RailChat, small = false) => (
    <button
      key={chat.id}
      type="button"
      aria-label={chat.label}
      aria-pressed={view === "chat" && activeChat === chat.id}
      onClick={() => onChat(chat.id)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
        small ? "text-[12px]" : "text-[13px]"
      } ${
        view === "chat" && activeChat === chat.id
          ? "bg-white font-medium text-[#0640d4] shadow-[0_0_0_1px_#dbe6ff]"
          : "text-[#5d6c7c] hover:bg-slate-50"
      }`}
    >
      {chat.connector ? (
        <BrandLogo id={chat.connector} size={18} className="!rounded-[5px]" />
      ) : (
        <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[#064cff] text-white">
          <img src="/brand/civimeet-mark.svg" alt="" className="h-3 w-3 brightness-0 invert" />
        </span>
      )}
      <span className="truncate">{chat.label}</span>
    </button>
  );

  return (
    <nav
      aria-label="Organizer workspace"
      className={`ow-nav sticky top-0 z-30 flex h-dvh shrink-0 flex-col border-r border-[#e4e9ec] bg-white transition-[width] duration-200 ${
        expanded ? "w-[264px] px-3" : "w-[76px] px-2.5"
      }`}
    >
      <div
        className={`flex items-center pb-3 pt-4 ${expanded ? "justify-between px-1.5" : "flex-col gap-3"}`}
      >
        <Link to="/" aria-label="CiviMeet home" className="flex items-center gap-2">
          <img src="/brand/civimeet-mark.svg" alt="" className="h-8 w-8" />
          {expanded && (
            <b className="text-[17px] font-semibold tracking-tight text-[#142d40]">CiviMeet</b>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          className="rounded-lg p-2 text-[#8191a3] transition-colors hover:bg-slate-100 hover:text-[#142d40]"
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      {expanded && (
        <button
          type="button"
          onClick={onIdentity}
          aria-label="Organization identity"
          className="mb-3 flex items-center gap-2.5 rounded-xl border border-[#e1e7f0] bg-[#eff3f8] p-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#153581] text-[11px] font-semibold text-[#dbe8ff]">
            {organization
              .split(" ")
              .map((word) => word[0])
              .slice(0, 3)
              .join("")}
          </span>
          <span className="min-w-0">
            <b className="block truncate text-[12px] font-semibold text-[#142d40]">
              {organization}
            </b>
            <small className="block truncate text-[11px] text-[#64717a]">
              {area || "Organization workspace"}
            </small>
          </span>
        </button>
      )}

      <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
        <div className="space-y-0.5 pb-3">
          {primaryViews.map(([id, label, Icon]) => (
            <div key={id}>
              {item(id, label, Icon)}
              {id === "chat" && expanded && (
                <div className="mb-2 ml-[22px] mt-1 space-y-0.5 border-l border-[#e4e9ec] pl-2.5">
                  {chats.map((chat) => chatButton(chat))}
                  {chats.length < 2 && (
                    <button
                      type="button"
                      onClick={() => onNavigate("connectors")}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[#8191a3] hover:bg-slate-50 hover:text-[#0640d4]"
                    >
                      <Plus size={14} /> Connect a platform to add its agent
                    </button>
                  )}
                  {topics.length > 0 && view === "chat" && (
                    <>
                      <p className="!mb-0 px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8191a3]">
                        Topics
                      </p>
                      {topics.map((topic) => chatButton(topic, true))}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="!my-3 h-px bg-[#e4e9ec]" role="separator" />

          {expanded ? (
            <>
              <p className="!mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8191a3]">
                Made by your agent
              </p>
              {recent.length ? (
                recent.map((artifact) => {
                  const Icon = artifactIcon(artifact.kind);
                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => onArtifact(artifact)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13px] text-[#5d6c7c] hover:bg-slate-50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f1f5f9] text-[#64717a]">
                        <Icon size={14} />
                      </span>
                      <span className="truncate">{artifact.title}</span>
                    </button>
                  );
                })
              ) : (
                <p className="!mb-0 px-3 py-1 text-[12px] text-[#8191a3]">
                  Drafts, briefs and designs will appear here.
                </p>
              )}
            </>
          ) : (
            recent.slice(0, 3).map((artifact) => {
              const Icon = artifactIcon(artifact.kind);
              return (
                <button
                  key={artifact.id}
                  type="button"
                  title={artifact.title}
                  aria-label={artifact.title}
                  onClick={() => onArtifact(artifact)}
                  className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#64717a] hover:bg-[#edf3ff] hover:text-[#0640d4]"
                >
                  <Icon size={18} />
                </button>
              );
            })
          )}
        </div>
        <div className="mt-auto space-y-0.5 border-t border-[#e4e9ec] py-3">
          {expanded && (
            <p className="!mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8191a3]">
              Workspace
            </p>
          )}
          {workspaceViews.map(([id, label, Icon]) => item(id, label, Icon, true))}
          {expanded && (
            <p className="!mb-0 truncate px-3 pt-2 text-[11px] text-[#8191a3]">
              <span className="font-semibold capitalize text-[#142d40]">{footer.title}</span> ·{" "}
              {footer.detail}
            </p>
          )}
        </div>
      </div>
    </nav>
  );
}
