import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Brain,
  ChevronDown,
  FileText,
  Globe,
  ListChecks,
  Monitor,
  PanelRightClose,
  Pause,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { useWorkspace } from "./WorkspaceGate";
import { PlatformBrowser } from "./BrowserDock";
import { LiveBrowser, connectorRequest } from "./Connectors";
import type { ReviewItem } from "@/lib/organizer";

export type PanelActivity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "research" | "draft" | "decision" | "browser" | "workspace";
};
export type PanelMemory = { id: string; kind: string; content: string; time?: string | undefined };
type Tab = "activity" | "approvals" | "browser" | "memory";
type AgentState = {
  status: "connected" | "not_connected" | "stopped" | "loading";
  paused: boolean;
  canStop: boolean;
  memory: PanelMemory[];
};
type Props = {
  demo: boolean;
  label: string;
  connector?: string | undefined;
  platformName?: string | undefined;
  approvals: ReviewItem[];
  activity: PanelActivity[];
  mainMemory: PanelMemory[];
  admin: boolean;
  webAgentId: string | null;
  onReview: (item: ReviewItem, decision: "approve" | "reject") => Promise<void>;
  onEdit: (item: ReviewItem) => void;
  onOpenConnections: () => void;
  onClose: () => void;
};

const when = (iso: string | undefined) => {
  if (!iso) return "";
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return iso;
  const minutes = Math.round((Date.now() - value) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440)
    return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const isToday = (iso: string) => {
  const value = Date.parse(iso);
  return !Number.isNaN(value) && new Date(value).toDateString() === new Date().toDateString();
};

export function AgentPanel(props: Props) {
  return props.demo ? <DemoAgentPanel {...props} /> : <LiveAgentPanel {...props} />;
}

function DemoAgentPanel(props: Props) {
  const [paused, setPaused] = useState(false);
  const memory: PanelMemory[] = props.connector
    ? [
        {
          id: "m1",
          kind: "fact",
          content: "Midvale Park Neighbors group allows event posts on weekends only.",
        },
        {
          id: "m2",
          kind: "conversation_summary",
          content:
            "Families keep asking about weekend meals; the mobile pantry schedule got the most replies.",
        },
      ]
    : props.mainMemory;
  return (
    <PanelView
      {...props}
      state={{ status: paused ? "stopped" : "connected", paused, canStop: true, memory }}
      onTogglePause={async () => setPaused((value) => !value)}
      browser={<DemoBrowserFrame name={props.platformName ?? "the web"} paused={paused} />}
    />
  );
}

function LiveAgentPanel(props: Props) {
  const { db, organizationId } = useWorkspace();
  const [state, setState] = useState<AgentState>({
    status: "loading",
    paused: false,
    canStop: false,
    memory: props.mainMemory,
  });
  const [agent, setAgent] = useState<{
    id: string;
    name: string;
    instructions: string;
    paused: boolean;
  } | null>(null);
  const [connected, setConnected] = useState(false);
  const load = useCallback(async () => {
    if (!props.connector) {
      setState({ status: "connected", paused: false, canStop: false, memory: props.mainMemory });
      return;
    }
    const [connection, platformAgent] = await Promise.all([
      db
        .from("organization_connectors")
        .select("status")
        .eq("organization_id", organizationId)
        .eq("connector", props.connector)
        .maybeSingle(),
      db
        .from("platform_agents")
        .select("id,name,instructions,paused")
        .eq("organization_id", organizationId)
        .eq("platform", props.connector)
        .maybeSingle(),
    ]);
    const live = connection.data?.status === "connected";
    setConnected(live);
    setAgent(platformAgent.data ?? null);
    let memory: PanelMemory[] = [];
    if (platformAgent.data) {
      const notes = await db
        .from("agent_memory")
        .select("id,kind,content,updated_at")
        .eq("organization_id", organizationId)
        .eq("agent_id", platformAgent.data.id)
        .order("updated_at", { ascending: false })
        .limit(12);
      memory = (notes.data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        content: row.content,
        time: row.updated_at,
      }));
    }
    setState({
      status: platformAgent.data?.paused ? "stopped" : live ? "connected" : "not_connected",
      paused: Boolean(platformAgent.data?.paused),
      canStop: Boolean(platformAgent.data),
      memory,
    });
  }, [db, organizationId, props.connector, props.mainMemory]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <PanelView
      {...props}
      state={state}
      onTogglePause={async () => {
        if (!agent) return;
        const { error } = await db.rpc("configure_platform_agent", {
          target_agent: agent.id,
          agent_name: agent.name,
          agent_instructions: agent.instructions,
          is_paused: !agent.paused,
        });
        if (error) throw new Error(error.message);
        await load();
      }}
      browser={
        props.connector ? (
          <PlatformAgentBrowser
            connector={props.connector}
            name={props.platformName ?? "this platform"}
            connected={connected}
            paused={state.paused}
            admin={props.admin}
            onOpenConnections={props.onOpenConnections}
            request={(body) => connectorRequest(db, organizationId, body)}
          />
        ) : props.webAgentId ? (
          <PlatformBrowser agentId={props.webAgentId} />
        ) : (
          <Callout
            icon={<Globe size={18} />}
            title="Turn on the public-web agent"
            text="Your main agent researches public websites in a supervised browser. Enable it in Connections."
            action={<SmallButton onClick={props.onOpenConnections}>Open Connections</SmallButton>}
          />
        )
      }
    />
  );
}

function PanelView({
  label,
  connector,
  platformName,
  approvals,
  activity,
  admin,
  onReview,
  onEdit,
  onClose,
  state,
  onTogglePause,
  browser,
}: Props & { state: AgentState; onTogglePause: () => Promise<void>; browser: ReactNode }) {
  const pending = approvals.filter((item) => item.status === "pending");
  // Approvals first when something is waiting; otherwise the agent's browser.
  const [tab, setTab] = useState<Tab>(pending.length ? "approvals" : "browser");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const status =
    state.status === "connected"
      ? { text: "Connected", dot: "bg-emerald-500" }
      : state.status === "stopped"
        ? { text: "Stopped", dot: "bg-amber-500" }
        : state.status === "loading"
          ? { text: "Checking…", dot: "bg-slate-300" }
          : { text: "Not connected", dot: "bg-slate-300" };
  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn’t work. Try again.");
    } finally {
      setBusy("");
    }
  }
  const tabs: [Tab, string, typeof ListChecks, number?][] = [
    ["activity", "Activity", ListChecks],
    ["approvals", "Approvals", ShieldCheck, pending.length],
    ["browser", "Browser", Monitor],
    ["memory", "Memory", Brain],
  ];
  return (
    <aside aria-label={`${label} panel`} className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-start gap-3 border-b border-[#e4e9ec] px-5 pb-4 pt-5">
        {connector ? (
          <BrandLogo id={connector} size={40} />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#064cff]">
            <img src="/brand/civimeet-mark.svg" alt="" className="h-6 w-6 brightness-0 invert" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="!mb-0.5 truncate text-[15px] font-semibold text-[#142d40]">{label}</p>
          <p className="!mb-0 inline-flex items-center gap-1.5 text-[12px] text-[#64717a]">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} /> {status.text}
          </p>
        </div>
        {state.canStop && (
          <button
            type="button"
            disabled={!admin || Boolean(busy)}
            onClick={() => run("pause", onTogglePause)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
              state.paused
                ? "bg-[#edf3ff] text-[#0640d4] hover:bg-[#dbe6ff]"
                : "text-red-600 hover:bg-red-50"
            }`}
          >
            {state.paused ? <Play size={14} /> : <Pause size={14} />}
            {state.paused ? "Resume agent" : "Stop agent"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide agent panel"
          className="rounded-lg p-1.5 text-[#8191a3] hover:bg-slate-100"
        >
          <PanelRightClose size={17} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div
          role="tablist"
          aria-label="Agent panel"
          className="grid grid-cols-4 gap-1 rounded-xl bg-[#eef2f5] p-1"
        >
          {tabs.map(([id, text, Icon, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-label={text}
              title={text}
              onClick={() => setTab(id)}
              className={`relative flex h-9 items-center justify-center rounded-lg transition ${
                tab === id
                  ? "bg-white text-[#142d40] shadow-sm"
                  : "text-[#64717a] hover:text-[#142d40]"
              }`}
            >
              <Icon size={17} />
              {Boolean(count) && (
                <span className="absolute right-2 top-1 rounded-full bg-[#d97706] px-1 text-[10px] font-semibold leading-4 text-white">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {tab === "activity" && <ActivityList items={activity} />}
        {tab === "approvals" && (
          <Approvals
            items={approvals}
            connector={connector}
            platformName={platformName}
            admin={admin}
            busy={busy}
            onDecide={(item, decision) =>
              run(`${item.id}:${decision}`, () => onReview(item, decision))
            }
            onEdit={onEdit}
          />
        )}
        {tab === "browser" && browser}
        {tab === "memory" && <MemoryList items={state.memory} label={label} />}
      </div>
    </aside>
  );
}

function ActivityList({ items }: { items: PanelActivity[] }) {
  if (!items.length)
    return (
      <Quiet text="Nothing yet. Everything this agent researches, drafts and does will show up here as it happens." />
    );
  const today = items.filter((item) => isToday(item.time));
  const earlier = items.filter((item) => !isToday(item.time));
  const icon = (kind: PanelActivity["kind"]) =>
    kind === "research" ? (
      <Search size={16} />
    ) : kind === "draft" ? (
      <FileText size={16} />
    ) : kind === "browser" ? (
      <Monitor size={16} />
    ) : kind === "decision" ? (
      <ShieldCheck size={16} />
    ) : (
      <Sparkles size={16} />
    );
  const group = (title: string, rows: PanelActivity[]) =>
    rows.length > 0 && (
      <section className="mb-5">
        <h3 className="!mb-3 text-[14px] font-semibold text-[#142d40]">{title}</h3>
        <ol className="space-y-4">
          {rows.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#475569]">
                {icon(item.kind)}
              </span>
              <div className="min-w-0">
                <p className="!mb-0.5 text-[14px] font-medium leading-snug text-[#142d40]">
                  {item.title}
                </p>
                {item.detail && (
                  <p className="!mb-0.5 line-clamp-2 text-[12px] text-[#64717a]">{item.detail}</p>
                )}
                <p className="!mb-0 text-[11px] text-[#8191a3]">{when(item.time)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  return (
    <>
      {group("Today", today)}
      {group("Earlier", earlier)}
    </>
  );
}

function Approvals({
  items,
  connector,
  platformName,
  admin,
  busy,
  onDecide,
  onEdit,
}: {
  items: ReviewItem[];
  connector?: string | undefined;
  platformName?: string | undefined;
  admin: boolean;
  busy: string;
  onDecide: (item: ReviewItem, decision: "approve" | "reject") => void;
  onEdit: (item: ReviewItem) => void;
}) {
  const pending = items.filter((item) => item.status === "pending");
  const decided = items.filter((item) => item.status !== "pending");
  const verb = (kind: string) =>
    kind === "payment"
      ? "Make this payment"
      : kind === "booking"
        ? "Request this booking"
        : kind === "message"
          ? "Send this message"
          : "Publish this post";
  const logo = connector ? (
    <BrandLogo id={connector} size={30} />
  ) : (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#edf3ff] text-[#0640d4]">
      <FileText size={15} />
    </span>
  );
  return (
    <>
      <h3 className="!mb-3 text-[14px] font-semibold text-[#142d40]">Waiting for you</h3>
      {pending.length ? (
        <ul className="mb-6 space-y-3">
          {pending.map((item) => (
            <li key={item.id} className="rounded-2xl border border-[#fde4b8] bg-[#fffaf0] p-4">
              <div className="flex gap-3">
                {logo}
                <div className="min-w-0 flex-1">
                  <p className="!mb-1 text-[14px] font-semibold text-[#142d40]">
                    {verb(item.kind)}
                    {platformName
                      ? ` on ${platformName}`
                      : item.destination
                        ? ` · ${item.destination}`
                        : ""}
                  </p>
                  <p className="!mb-3 line-clamp-4 whitespace-pre-wrap text-[13px] text-[#475569]">
                    {item.content}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!admin || Boolean(busy)}
                      onClick={() => onDecide(item, "approve")}
                      className="rounded-lg bg-[#064cff] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#0640d4]"
                    >
                      {busy === `${item.id}:approve` ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => onEdit(item)}
                      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#475569] hover:bg-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={!admin || Boolean(busy)}
                      onClick={() => onDecide(item, "reject")}
                      className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-red-600 hover:bg-red-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet text="Nothing waiting. Posts, messages, bookings and payments this agent prepares will wait here for your OK." />
      )}
      {decided.length > 0 && (
        <>
          <h3 className="!mb-3 mt-2 text-[14px] font-semibold text-[#142d40]">Approvals history</h3>
          <ul className="space-y-1">
            {decided.map((item) => (
              <li key={item.id}>
                <details className="group rounded-xl px-2 py-2 hover:bg-slate-50">
                  <summary className="flex cursor-pointer list-none gap-3">
                    {logo}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-[#142d40]">
                        {verb(item.kind)}
                        {platformName ? ` on ${platformName}` : ""}
                      </span>
                      <span className="block truncate text-[12px] text-[#64717a]">
                        {item.title}
                      </span>
                      <span className="block text-[11px] text-[#8191a3]">
                        {item.status === "approved" ? "Allowed" : "Declined"}
                        {item.reviewed_at ? ` · ${when(item.reviewed_at)}` : ""}
                      </span>
                    </span>
                    <ChevronDown
                      size={16}
                      className="mt-1 shrink-0 text-[#8191a3] transition group-open:rotate-180"
                    />
                  </summary>
                  <p className="!mb-0 mt-2 whitespace-pre-wrap pl-[42px] text-[13px] text-[#475569]">
                    {item.content}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function MemoryList({ items, label }: { items: PanelMemory[]; label: string }) {
  return (
    <>
      <p className="!mb-4 text-[12px] text-[#64717a]">
        {label} carries these notes into every conversation, along with your organization’s brief
        and knowledge. Notes from chats are kept for 90 days.
      </p>
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-[#e4e9ec] p-3">
              <p className="!mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8191a3]">
                {item.kind === "conversation_summary"
                  ? "From a conversation"
                  : item.kind === "follow_up"
                    ? "Follow-up"
                    : item.kind === "checkpoint"
                      ? "Checkpoint"
                      : "Fact"}
                {item.time ? ` · ${when(item.time)}` : ""}
              </p>
              <p className="!mb-0 line-clamp-4 whitespace-pre-wrap text-[13px] text-[#334155]">
                {item.content}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet text="No memories yet. As you chat, this agent saves what it learns here." />
      )}
    </>
  );
}

function PlatformAgentBrowser({
  connector,
  name,
  connected,
  paused,
  admin,
  onOpenConnections,
  request,
}: {
  connector: string;
  name: string;
  connected: boolean;
  paused: boolean;
  admin: boolean;
  onOpenConnections: () => void;
  request: (body: {
    command: "browser_open" | "browser_cancel" | "browser_observe";
    connector: string;
  }) => Promise<{ viewer?: string; expiresAt?: string; status?: string }>;
}) {
  const [viewer, setViewer] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function run(
    label: string,
    command: "browser_open" | "browser_cancel" | "browser_observe",
  ) {
    setBusy(label);
    setError("");
    try {
      const result = await request({ command, connector });
      setViewer(
        result.viewer && result.expiresAt
          ? { url: result.viewer, expiresAt: result.expiresAt }
          : null,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The browser could not open.");
    } finally {
      setBusy(null);
    }
  }
  if (!connected)
    return (
      <Callout
        icon={<BrandLogo id={connector} size={22} />}
        title={`Connect ${name} first`}
        text={`Once ${name} is connected, its agent works here in its own signed-in browser and you can watch or take over.`}
        action={<SmallButton onClick={onOpenConnections}>Open Connections</SmallButton>}
      />
    );
  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{error}</p>
      )}
      {viewer ? (
        <LiveBrowser
          name={name}
          viewer={viewer}
          busy={busy}
          title={`${name} · you’re in control`}
          cancelLabel="Give back to agent"
          onCancel={() => run("cancel", "browser_cancel")}
          onExpired={() => run("observe", "browser_observe")}
        />
      ) : (
        <Callout
          icon={<Monitor size={18} />}
          title={paused ? "Agent stopped" : `Agent’s ${name} browser`}
          text={
            paused
              ? `The agent won’t act on ${name} until you resume it. You can still open the browser yourself.`
              : `The agent works in this signed-in browser. Take over any time to steer it, then give it back.`
          }
          action={
            <SmallButton
              primary
              disabled={!admin || Boolean(busy)}
              onClick={() => run("open", "browser_open")}
            >
              {busy === "open" ? "Opening…" : "Take over"}
            </SmallButton>
          }
        />
      )}
    </div>
  );
}

function DemoBrowserFrame({ name, paused }: { name: string; paused: boolean }) {
  const [control, setControl] = useState<"agent" | "you">("agent");
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e4e9ec]">
      <div className="flex items-center gap-2 border-b border-[#eef2f5] bg-[#f8fafb] px-3 py-2 text-[12px] text-[#64717a]">
        <span className={`h-2 w-2 rounded-full ${paused ? "bg-amber-500" : "bg-emerald-500"}`} />
        {paused
          ? "Agent stopped"
          : control === "you"
            ? "You’re in control"
            : "Agent is browsing"} · {name} · sample
      </div>
      <div className="space-y-2 p-4 text-[13px] text-[#475569]">
        <p className="!mb-0 font-medium text-[#142d40]">Midvale Park Neighbors</p>
        <p className="!mb-0">“Does anyone know where families can get weekend meals?”</p>
        <p className="!mb-0 rounded-lg bg-[#edf3ff] p-2 text-[#0640d4]">
          Draft reply waiting in Approvals · not posted
        </p>
      </div>
      <div className="flex gap-2 border-t border-[#eef2f5] px-3 py-2">
        <SmallButton
          primary
          disabled={paused}
          onClick={() => setControl(control === "you" ? "agent" : "you")}
        >
          {control === "you" ? "Give back to agent" : "Take over"}
        </SmallButton>
      </div>
    </div>
  );
}

function Callout({
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
    <div className="rounded-2xl border border-[#e4e9ec] p-4">
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf3ff] text-[#0640d4]">
        {icon}
      </span>
      <p className="!mb-1 text-[14px] font-semibold text-[#142d40]">{title}</p>
      <p className="!mb-3 text-[13px] text-[#64717a]">{text}</p>
      {action}
    </div>
  );
}
function SmallButton({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${primary ? "bg-[#064cff] text-white hover:bg-[#0640d4]" : "border border-[#d7e0e5] text-[#142d40] hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}
function Quiet({ text }: { text: string }) {
  return <p className="rounded-xl bg-[#f8fafb] px-4 py-4 text-[13px] text-[#64717a]">{text}</p>;
}
