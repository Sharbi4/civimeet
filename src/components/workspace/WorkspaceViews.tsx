import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Mic,
  Newspaper,
  Search,
  Sparkles,
  Target,
  Video,
} from "lucide-react";

export type FeedEntry = {
  id: string;
  kind: "research" | "need" | "activity";
  label: string;
  title: string;
  text: string;
  url?: string | undefined;
  time: string;
};
export type IdeaEntry = {
  id: string;
  title: string;
  contribution: string;
  gathering: string;
  followUpOn: string;
  status: string;
};
export type GoalNeed = { id: string; title: string; detail: string; priority: string };
export type AgentWork = {
  id: string;
  title: string;
  kind: string;
  text: string;
  time?: string | undefined;
};

const when = (iso: string) => {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  const days = Math.round((Date.now() - value) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Header({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="!mb-1 text-[26px] font-semibold tracking-tight text-[#142d40]">{title}</h2>
        <p className="!mb-0 max-w-2xl text-[14px] text-[#64717a]">{text}</p>
      </div>
      {action}
    </div>
  );
}
function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[#edf3ff] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0640d4]">
      {children}
    </span>
  );
}
function Blank({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d7e0e5] bg-white px-6 py-12 text-center">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf3ff] text-[#0640d4]">
        {icon}
      </span>
      <h3 className="!mb-1 text-[16px] font-semibold text-[#142d40]">{title}</h3>
      <p className="mx-auto !mb-4 max-w-md text-[13px] text-[#64717a]">{text}</p>
      {action}
    </div>
  );
}
const primary =
  "inline-flex items-center gap-2 rounded-xl bg-[#064cff] px-4 py-2.5 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#0640d4]";
const quiet =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#0640d4] transition hover:bg-[#edf3ff]";

export function FeedView({
  entries,
  demo,
  onDiscuss,
}: {
  entries: FeedEntry[];
  demo: boolean;
  onDiscuss: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto max-w-[820px]">
      <Header
        title="Around your cause"
        text="What’s happening around your cause: research your agent ran, needs your community raised and the latest from your workspace."
      />
      {entries.length ? (
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-[#e4e9ec] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
            >
              <div className="mb-2 flex items-center gap-2 text-[12px] text-[#8191a3]">
                <Pill>{entry.label}</Pill>
                <span>{when(entry.time)}</span>
                {demo && <span>· sample</span>}
              </div>
              <h3 className="!mb-1 text-[16px] font-semibold text-[#142d40]">{entry.title}</h3>
              {entry.text && (
                <p className="!mb-3 line-clamp-3 text-[14px] text-[#475569]">{entry.text}</p>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className={quiet}
                  onClick={() =>
                    onDiscuss(`Let’s talk about this: ${entry.title}. ${entry.text.slice(0, 400)}`)
                  }
                >
                  Discuss with your agent <ArrowRight size={14} />
                </button>
                {entry.url && (
                  <a href={entry.url} target="_blank" rel="noreferrer" className={quiet}>
                    Source <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Blank
          icon={<Newspaper size={20} />}
          title="Your feed fills up as your agent works."
          text="Ask your agent to research your community, or record a community need, and it will show up here."
          action={
            <button
              type="button"
              className={primary}
              onClick={() =>
                onDiscuss(
                  "Research what’s happening in our community this week and what people need.",
                )
              }
            >
              Research our community
            </button>
          }
        />
      )}
    </div>
  );
}

export function IdeasView({
  ideas,
  demo,
  onDevelop,
  onEvent,
}: {
  ideas: IdeaEntry[];
  demo: boolean;
  onDevelop: (prompt: string) => void;
  onEvent: () => void;
}) {
  const ask =
    "Suggest three new ideas for bringing our community together this month, based on our mission and what people need. Explain why each would work.";
  return (
    <div className="mx-auto max-w-[980px]">
      <Header
        title="Ideas worth trying"
        text="Ideas your agent and team have come up with. Develop the good ones into plans and events."
        action={
          <button type="button" className={primary} onClick={() => onDevelop(ask)}>
            <Sparkles size={16} /> Get new ideas
          </button>
        }
      />
      {ideas.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {ideas.map((idea) => (
            <article
              key={idea.id}
              className="flex flex-col rounded-2xl border border-[#e4e9ec] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
            >
              <div className="mb-3 flex items-center gap-2 text-[12px] text-[#8191a3]">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff7e6] text-[#b45309]">
                  <Lightbulb size={15} />
                </span>
                <span className="capitalize">
                  {idea.status === "draft" ? "New idea" : idea.status}
                </span>
                {idea.followUpOn && <span>· revisit {idea.followUpOn}</span>}
                {demo && <span>· sample</span>}
              </div>
              <h3 className="!mb-2 text-[16px] font-semibold text-[#142d40]">{idea.title}</h3>
              <p className="!mb-2 text-[14px] text-[#475569]">{idea.contribution}</p>
              {idea.gathering && (
                <p className="!mb-3 text-[13px] text-[#64717a]">Gathering: {idea.gathering}</p>
              )}
              <div className="mt-auto flex flex-wrap gap-1 pt-2">
                <button
                  type="button"
                  className={quiet}
                  onClick={() =>
                    onDevelop(`Develop this idea into a plan: ${idea.title}. ${idea.contribution}`)
                  }
                >
                  Develop with agent <ArrowRight size={14} />
                </button>
                <button type="button" className={quiet} onClick={onEvent}>
                  <CalendarDays size={14} /> Make it an event
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Blank
          icon={<Lightbulb size={20} />}
          title="No ideas yet."
          text="Your agent turns your mission and community needs into ideas worth trying."
          action={
            <button type="button" className={primary} onClick={() => onDevelop(ask)}>
              Get new ideas
            </button>
          }
        />
      )}
    </div>
  );
}

export function GoalsView({
  mission,
  goal,
  area,
  stats,
  needs,
  demo,
  onEdit,
  onDiscuss,
}: {
  mission: string;
  goal: string;
  area: string;
  stats: [string, string][];
  needs: GoalNeed[];
  demo: boolean;
  onEdit: () => void;
  onDiscuss: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto max-w-[980px]">
      <Header
        title="What you’re working toward"
        text="What your organization is working toward. Your agent plans every post, outreach and event around these."
        action={
          <button type="button" className={primary} onClick={onEdit}>
            <Target size={16} /> Edit goals
          </button>
        }
      />
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl bg-[#064cff] p-6 text-white shadow-[0_12px_32px_-16px_rgba(6,76,255,.6)]">
          <p className="!mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
            Current goal
          </p>
          <h3 className="!mb-3 text-[22px] font-semibold leading-snug">
            {goal || "Set a goal so your agent knows what to work toward."}
          </h3>
          <p className="!mb-5 text-[14px] text-white/85">{mission}</p>
          <button
            type="button"
            onClick={() =>
              onDiscuss(
                `Make a plan to reach our goal${goal ? `: ${goal}` : ""}. Break it into this week’s steps.`,
              )
            }
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-[#0640d4] transition hover:bg-[#edf3ff]"
          >
            Plan the next steps <ArrowRight size={15} />
          </button>
        </section>
        <section className="grid grid-cols-2 gap-3">
          {stats.map(([value, label]) => (
            <div key={label} className="rounded-2xl border border-[#e4e9ec] bg-white p-4">
              <strong className="block text-[26px] font-semibold tabular-nums text-[#142d40]">
                {value}
              </strong>
              <span className="text-[12px] text-[#64717a]">
                {label}
                {demo ? " · sample" : ""}
              </span>
            </div>
          ))}
        </section>
      </div>
      <section className="mt-8">
        <h3 className="!mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8191a3]">
          What {area || "your community"} needs
        </h3>
        {needs.length ? (
          <ul className="divide-y divide-[#eef2f5] overflow-hidden rounded-2xl border border-[#e4e9ec] bg-white">
            {needs.map((need) => (
              <li key={need.id} className="flex items-start gap-3 px-5 py-4">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${need.priority === "high" ? "bg-[#d97706]" : "bg-[#94a3b8]"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="!mb-0.5 text-[14px] font-medium text-[#142d40]">{need.title}</p>
                  {need.detail && (
                    <p className="!mb-0 line-clamp-2 text-[13px] text-[#64717a]">{need.detail}</p>
                  )}
                </div>
                <button
                  type="button"
                  className={quiet}
                  onClick={() =>
                    onDiscuss(
                      `How can we help with this community need: ${need.title}? ${need.detail}`,
                    )
                  }
                >
                  Help with this
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#d7e0e5] bg-white px-5 py-6 text-[13px] text-[#64717a]">
            No open community needs recorded yet. Your agent adds them as it listens in your
            connected communities.
          </p>
        )}
      </section>
    </div>
  );
}

export type SearchItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  open: () => void;
};
export function SearchView({ items, children }: { items: SearchItem[]; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    return items
      .filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(text))
      .slice(0, 20);
  }, [items, query]);
  return (
    <div className="mx-auto max-w-[900px]">
      <Header
        title="Find anything"
        text="Find anything in your workspace, or have your agent research your community."
      />
      <label className="relative block">
        <span className="sr-only">Search your workspace</span>
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8191a3]"
        />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search events, ideas, drafts, research…"
          className="!w-full !rounded-2xl !py-3.5 !pl-11 !text-[15px] shadow-[0_1px_2px_rgba(15,23,42,.04)]"
        />
      </label>
      {query.trim() && (
        <ul className="mt-3 divide-y divide-[#eef2f5] overflow-hidden rounded-2xl border border-[#e4e9ec] bg-white">
          {results.map((item) => (
            <li key={`${item.type}:${item.id}`}>
              <button
                type="button"
                onClick={item.open}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
              >
                <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8191a3]">
                  {item.type}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-[#142d40]">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="block truncate text-[12px] text-[#64717a]">{item.detail}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="px-5 py-4 text-[13px] text-[#64717a]">
              Nothing in your workspace matches. Try researching it below.
            </li>
          )}
        </ul>
      )}
      <div className="mt-10">{children}</div>
    </div>
  );
}

const libraryKinds = [
  ["all", "All", FileText],
  ["documents", "Documents", FileText],
  ["images", "Images", ImageIcon],
  ["videos", "Videos", Video],
  ["podcasts", "Podcasts", Mic],
] as const;
export function AgentLibrary({
  work,
  demo,
  onOpen,
}: {
  work: AgentWork[];
  demo: boolean;
  onOpen: (item: AgentWork) => void;
}) {
  const [kind, setKind] = useState<(typeof libraryKinds)[number][0]>("all");
  const shown = kind === "all" || kind === "documents" ? work : [];
  return (
    <section className="mx-auto mb-10 max-w-[980px]">
      <Header
        title="Everything your agent made"
        text="Everything your agent has made: drafts, research briefs, designs, images, videos and podcasts."
      />
      <div
        role="radiogroup"
        aria-label="Library type"
        className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-[#eef2f5] p-1"
      >
        {libraryKinds.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={kind === id}
            onClick={() => setKind(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
              kind === id
                ? "bg-white text-[#142d40] shadow-sm"
                : "text-[#64717a] hover:text-[#142d40]"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="flex flex-col rounded-2xl border border-[#e4e9ec] bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-[#c7d7fe] hover:shadow-md"
            >
              <span className="mb-3 flex aspect-[16/9] w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#edf3ff] to-[#f8fafb] text-[#0640d4]">
                {item.kind === "research" ? <Search size={22} /> : <FileText size={22} />}
              </span>
              <span className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8191a3]">
                {item.kind}
                {demo ? " · sample" : ""}
              </span>
              <span className="line-clamp-2 text-[14px] font-medium text-[#142d40]">
                {item.title}
              </span>
              <span className="mt-1 line-clamp-2 text-[12px] text-[#64717a]">{item.text}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[#d7e0e5] bg-white px-5 py-6 text-[13px] text-[#64717a]">
          {kind === "all" || kind === "documents"
            ? "Nothing yet. Drafts and research briefs your agent prepares will collect here."
            : `${libraryKinds.find(([id]) => id === kind)![1]} your agent creates will appear here.`}
        </p>
      )}
    </section>
  );
}
