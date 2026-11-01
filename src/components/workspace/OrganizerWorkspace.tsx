import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageCircle,
  Search,
  CalendarDays,
  Users,
  BookOpen,
  Plug,
  CheckCircle,
  Activity,
  Monitor,
  X,
  ArrowRight,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceGate";
import { OrganizerChat } from "./OrganizerChat";
import { PlatformBrowser } from "./BrowserDock";
import { LocalDiscoveryPanel } from "./LocalDiscoveryPanel";
import { OrganizationBrief } from "./OrganizationBrief";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Events } from "@/routes/events";
import { VendorDirectory } from "@/routes/vendors";
import { OrganizationKnowledge } from "@/routes/knowledge";
import { PlatformAgents } from "@/routes/platform-agents";
import {
  demoApprovals,
  demoReplies,
  organizerThreads,
  threadLabels,
  type OrganizerThread,
  type ReviewItem,
} from "@/lib/organizer";
import "./organizer.css";

type View =
  | "dashboard"
  | "chat"
  | "discover"
  | "events"
  | "people"
  | "library"
  | "browser"
  | "connectors"
  | "approvals"
  | "activity";
const views = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["chat", "Organizer Chat", MessageCircle],
  ["browser", "Browser Sessions", Monitor],
  ["events", "Events", CalendarDays],
  ["discover", "Discover", Search],
  ["people", "People", Users],
  ["library", "Library", BookOpen],
  ["connectors", "Connectors", Plug],
  ["approvals", "Approvals", CheckCircle],
  ["activity", "Activity", Activity],
] as const;
type Task = { id: string; title: string; follow_up: string; follow_up_on: string; status: string };
type EventRow = { id: string; title: string; event_date: string; venue: string; status: string };
type Log = { id: string; action: string; actor_id?: string; created_at: string };
type SessionRow = {
  id: string;
  agent_id: string;
  state: string;
  task: string;
  current_origin: string;
};
type WorkspaceData = {
  name: string;
  mission: string;
  area: string;
  tasks: Task[];
  events: EventRow[];
  activity: Log[];
  sessions: SessionRow[];
  approvals: ReviewItem[];
  vendorCount: number;
  webAgentId: string | null;
};
const blank: WorkspaceData = {
  name: "Your community",
  mission: "Add your mission in Identity.",
  area: "",
  tasks: [],
  events: [],
  activity: [],
  sessions: [],
  approvals: [],
  vendorCount: 0,
  webAgentId: null,
};
const demoData: WorkspaceData = {
  ...blank,
  name: "Tucson Community Alliance",
  mission: "Connect Tucson residents to food, housing, health, and library resources.",
  area: "Tucson, AZ",
  vendorCount: 18,
  approvals: demoApprovals,
  tasks: [
    {
      id: "task1",
      title: "Confirm venue requirements",
      follow_up: "Compare accessible spaces for 200 people.",
      follow_up_on: "Next week · sample",
      status: "draft",
    },
    {
      id: "task2",
      title: "Prepare volunteer briefing",
      follow_up: "Define roles and opt-in shifts.",
      follow_up_on: "Before the fair · sample",
      status: "draft",
    },
  ],
  events: [
    {
      id: "fair",
      title: "Neighborhood Resource Fair",
      event_date: "Next month · sample",
      venue: "Tucson · venue to be confirmed",
      status: "draft",
    },
  ],
  activity: [
    { id: "a1", action: "Sample event plan prepared for review", created_at: "Sample timeline" },
  ],
  sessions: [
    {
      id: "s1",
      agent_id: "facebook",
      state: "waiting_for_approval",
      task: "Prepare Facebook Group announcement",
      current_origin: "https://www.facebook.com",
    },
    {
      id: "s2",
      agent_id: "venue",
      state: "paused",
      task: "Compare venue requirements",
      current_origin: "Sample venue page",
    },
  ],
};

export function LiveOrganizerWorkspace() {
  const { db, organizationId, role } = useWorkspace();
  const [data, setData] = useState(blank);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const r = await Promise.all([
      db.from("organizations").select("name").eq("id", organizationId).single(),
      db
        .from("organization_briefs")
        .select("mission,area")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db
        .from("steward_plans")
        .select("id,title,follow_up,follow_up_on,status")
        .eq("organization_id", organizationId)
        .order("follow_up_on")
        .limit(25),
      db
        .from("community_events")
        .select("id,title,event_date,venue,status")
        .eq("organization_id", organizationId)
        .order("event_date")
        .limit(25),
      db
        .from("vendor_activity")
        .select("id,action,actor_id,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("browser_workspaces")
        .select("id,agent_id,state,task,current_origin")
        .eq("organization_id", organizationId)
        .limit(25),
      db
        .from("organizer_approvals")
        .select("id,title,content,destination,kind,status,revision,reviewed_at,reviewed_by")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .neq("status", "archived"),
      db
        .from("platform_agents")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("platform", "web")
        .eq("selected", true)
        .maybeSingle(),
    ]);
    if (r.some((x) => x.error)) {
      setError(
        "Some workspace data could not load. Refresh to try again; sample results are never substituted.",
      );
    } else setError("");
    setData({
      name: r[0].data?.name ?? blank.name,
      mission: r[1].data?.mission ?? blank.mission,
      area: r[1].data?.area ?? "",
      tasks: (r[2].data ?? []) as Task[],
      events: (r[3].data ?? []) as EventRow[],
      activity: (r[4].data ?? []) as Log[],
      sessions: (r[5].data ?? []) as SessionRow[],
      approvals: (r[6].data ?? []) as ReviewItem[],
      vendorCount: r[7].count ?? 0,
      webAgentId: r[8].data?.id ?? null,
    });
    setLoading(false);
  }, [db, organizationId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <OrganizerWorkspace
      data={data}
      demo={false}
      role={role}
      error={error}
      loading={loading}
      refresh={load}
      review={async (item, decision) => {
        const r = await db.rpc("review_organizer_approval", {
          target: item.id,
          expected_revision: item.revision,
          decision,
        });
        if (r.error) throw new Error(r.error.message);
        await load();
      }}
      save={async (draft, item) => {
        const r = await db.rpc("save_organizer_approval", {
          workspace: organizationId,
          draft,
          target: item?.id ?? null,
          expected_revision: item?.revision ?? null,
        });
        if (r.error) throw new Error(r.error.message);
        await load();
      }}
    />
  );
}
export function DemoOrganizerWorkspace() {
  const [data, setData] = useState(demoData);
  return (
    <OrganizerWorkspace
      demo
      data={data}
      role="admin"
      refresh={async () => {}}
      review={async (item, decision) => {
        setData((d) => ({
          ...d,
          approvals: d.approvals.map((a) =>
            a.id === item.id
              ? { ...a, status: decision === "approve" ? "approved" : "rejected" }
              : a,
          ),
          activity: [
            {
              id: crypto.randomUUID(),
              action: `Sample ${item.title}: ${decision}. No external action taken.`,
              created_at: new Date().toISOString(),
            },
            ...d.activity,
          ],
        }));
      }}
      save={async (draft, item) => {
        setData((d) => ({
          ...d,
          approvals: item
            ? d.approvals.map((a) =>
                a.id === item.id
                  ? { ...a, ...draft, status: "pending", revision: a.revision + 1 }
                  : a,
              )
            : [
                { ...draft, id: crypto.randomUUID(), revision: 1, status: "pending" },
                ...d.approvals,
              ],
        }));
      }}
    />
  );
}
type Draft = Pick<ReviewItem, "title" | "content" | "destination" | "kind">;
type Props = {
  data: WorkspaceData;
  demo: boolean;
  role: string;
  error?: string;
  loading?: boolean;
  refresh: () => Promise<void>;
  review: (item: ReviewItem, decision: "approve" | "reject") => Promise<void>;
  save: (draft: Draft, item?: ReviewItem) => Promise<void>;
};
function OrganizerWorkspace({ data, demo, role, error, loading, refresh, review, save }: Props) {
  const [view, setView] = useState<View>("dashboard");
  const [thread, setThread] = useState<OrganizerThread>("main");
  const [panel, setPanel] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<ReviewItem>();
  const [chatSeed, setChatSeed] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState("");
  const [sampleNotes, setSampleNotes] = useState<Record<OrganizerThread, string[]>>({
    main: [],
    venue: [],
    outreach: [],
    volunteers: [],
  });
  const pending = data.approvals.filter((a) => a.status === "pending");
  const admin = role === "admin" || role === "owner";
  const editor = role !== "viewer";
  const navigate = (next: View) => {
    setView(next);
    setNotice("");
  };
  function openChat(text: string) {
    setChatSeed(text);
    setThread("main");
    navigate("chat");
  }
  function edit(item?: ReviewItem, content = "") {
    setEditing(item);
    setDraft(
      item
        ? {
            title: item.title,
            content: item.content,
            destination: item.destination,
            kind: item.kind,
          }
        : { title: "Community update", content, destination: "", kind: "post" },
    );
  }
  async function act(work: () => Promise<void>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      setNotice(success);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const approvalCards = (items: ReviewItem[]) =>
    items.length ? (
      <div className="ow-approval-list">
        {items.map((a) => (
          <article className="ow-card" key={a.id}>
            <div className="ow-card-top">
              <span>
                {a.kind} · {a.status}
              </span>
              <button
                className="ow-link"
                onClick={() =>
                  openChat(`Help me review this draft for ${a.destination}: ${a.content}`)
                }
              >
                Discuss in chat <ArrowRight size={13} />
              </button>
            </div>
            <h3>{a.title}</h3>
            <p className="ow-destination">{a.destination}</p>
            <p className="ow-draft-copy">{a.content}</p>
            {a.status === "pending" ? (
              <div className="ow-buttons">
                <button
                  disabled={!admin || busy}
                  onClick={() =>
                    void act(
                      () => review(a, "approve"),
                      demo
                        ? "Sample approved. Nothing was posted, booked, or paid."
                        : "Draft approved for the recorded destination. External execution is not enabled; nothing was sent or paid.",
                    )
                  }
                >
                  Approve draft
                </button>
                <button disabled={!editor || busy} onClick={() => edit(a)}>
                  Edit
                </button>
                <button
                  disabled={!admin || busy}
                  onClick={() => void act(() => review(a, "reject"), "Draft rejected.")}
                >
                  Reject
                </button>
              </div>
            ) : (
              <small>
                Decision recorded
                {a.reviewed_at ? ` · ${new Date(a.reviewed_at).toLocaleString()}` : ""}. No external
                execution.
              </small>
            )}
          </article>
        ))}
      </div>
    ) : (
      <Empty
        title="You’re all caught up."
        text="Prepared drafts will appear here for review. Nothing is published or paid automatically."
      />
    );
  const tasks = (
    <div className="ow-list">
      {data.tasks
        .filter((t) => t.status !== "completed")
        .map((t) => (
          <button key={t.id} onClick={() => openChat(`${t.title}: ${t.follow_up}`)}>
            <CalendarDays size={18} />
            <span>
              <b>{t.title}</b>
              <small>{t.follow_up_on}</small>
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
      {!data.tasks.length && (
        <p>No saved planning tasks yet. Start with a goal in Organizer Chat.</p>
      )}
    </div>
  );
  const activity = (
    <div className="ow-list">
      {data.activity.map((a) => (
        <article key={a.id}>
          <Activity size={16} />
          <span>
            <b>{a.action.replaceAll("_", " ")}</b>
            <small>
              {Number.isNaN(Date.parse(a.created_at))
                ? a.created_at
                : new Date(a.created_at).toLocaleString()}
              {a.actor_id ? ` · Actor ${a.actor_id.slice(0, 8)}` : ""}
            </small>
          </span>
        </article>
      ))}
      {!data.activity.length && <p>Your organization’s recorded actions will appear here.</p>}
    </div>
  );
  return (
    <div className="ow-app">
      <nav className="ow-rail" aria-label="Organizer workspace">
        <Link to="/" aria-label="CiviMeet home" className="ow-brand">
          <img src="/brand/civimeet-mark.svg" alt="" />
          <span>
            <b>CiviMeet</b>
            <small>Community OS</small>
          </span>
        </Link>
        <button
          className="ow-org-card"
          onClick={() => setPanel("Identity")}
          aria-label="Organization identity"
        >
          <span className="ow-org-monogram">
            {data.name
              .split(" ")
              .map((word) => word[0])
              .slice(0, 3)
              .join("")}
          </span>
          <span>
            <b>{data.name}</b>
            <small>{data.area || "Organization workspace"}</small>
          </span>
        </button>
        <p className="ow-nav-label">Workspace</p>
        {views.map(([id, label, Icon]) => (
          <Fragment key={id}>
            {id === "discover" && <p className="ow-nav-label">Community</p>}
            {id === "approvals" && <p className="ow-nav-label">Oversight</p>}
            <button
              key={id}
              aria-label={label}
              title={label}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
              {id === "approvals" && pending.length > 0 && <i>{pending.length}</i>}
            </button>
          </Fragment>
        ))}
        <div className="ow-organizer-card">
          <h3>Your AI Organizer</h3>
          <p>
            {demo
              ? "Preparing the Tucson Resource Fair — research, outreach drafts, and the next steps."
              : "Research your community, prepare useful contributions, and bring people together."}
          </p>
          <div>
            <span>Contribute</span>
            <span>Connect</span>
            <span>Meet Up</span>
          </div>
        </div>
        <div className="ow-sidebar-role">
          <span>{demo ? "Sample administrator" : role === "organizer" ? "Editor" : role}</span>
          <small>{demo ? "Demo workspace" : "Organization workspace"}</small>
        </div>
      </nav>
      <div className="ow-body">
        <header className="ow-top">
          <div>
            <span className="ow-kicker">Contribute. Connect. Meet Up.</span>
            <h1>{views.find((v) => v[0] === view)?.[1]}</h1>
          </div>
          <div className="ow-search">
            <input
              type="search"
              aria-label="Search workspace"
              placeholder="Search chats, events, people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
            />
            {search.trim() && (
              <div className="ow-search-results">
                {views
                  .filter((v) => v[1].toLowerCase().includes(search.toLowerCase()))
                  .map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => {
                        navigate(id);
                        setSearch("");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                {data.tasks
                  .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        openChat(`${t.title}: ${t.follow_up}`);
                        setSearch("");
                      }}
                    >
                      {t.title}
                    </button>
                  ))}
                {data.events
                  .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        navigate("events");
                        setSearch("");
                      }}
                    >
                      {t.title}
                    </button>
                  ))}
                {!views.some((v) => v[1].toLowerCase().includes(search.toLowerCase())) &&
                  !data.tasks.some((t) => t.title.toLowerCase().includes(search.toLowerCase())) &&
                  !data.events.some((t) =>
                    t.title.toLowerCase().includes(search.toLowerCase()),
                  ) && <p>No matching views or loaded plans.</p>}
              </div>
            )}
          </div>
          <div className="ow-top-actions">
            <button onClick={() => navigate("browser")}>Watch browser</button>
            <button onClick={() => navigate("chat")}>Ask organizer</button>
          </div>
          <button
            className="ow-identity"
            onClick={() => setPanel(panel ? null : "Identity")}
            aria-label="Open organizer details"
          >
            <img src="/brand/civimeet-mark.svg" alt="" />
            <span>
              {data.name}
              <small>Community organizer</small>
            </span>
          </button>
        </header>
        {demo && (
          <div className="ow-demo-banner">
            <strong>Demo / Sample data</strong>
            <span>No live accounts, messages, bookings, or payments. Changes reset on reload.</span>
            <Link to="/dashboard">Open your workspace →</Link>
          </div>
        )}
        {loading && (
          <p role="status" className="ow-notice">
            Loading your organization…
          </p>
        )}
        {error && (
          <p role="alert" className="ow-notice">
            {error} <button onClick={() => void refresh()}>Refresh</button>
          </p>
        )}
        {notice && (
          <p role="status" className="ow-notice">
            {notice}
          </p>
        )}
        <main className={`ow-main ${view === "chat" ? "ow-main-chat" : ""}`}>
          {view === "dashboard" && (
            <>
              <div className="ow-welcome">
                <div>
                  <span className="ow-supervision-status">
                    {demo
                      ? "Sample organizer · waiting for your review"
                      : `${pending.length} drafts awaiting review`}
                  </span>
                  <h2>
                    {demo
                      ? "Your Resource Fair starts with a good plan."
                      : "Bring people together. Let AI do the groundwork."}
                  </h2>
                  <p>
                    {demo
                      ? "Neighborhood Resource Fair · Tucson · next month"
                      : "Your organizer prepares the groundwork. You decide what happens next."}
                  </p>
                </div>
                <button className="ow-primary" onClick={() => navigate("chat")}>
                  Talk to your organizer <ArrowRight size={16} />
                </button>
              </div>
              <div className="ow-dashboard-grid">
                <section>
                  <div className="ow-section-title">
                    <h2>
                      Needs your review <span>{pending.length}</span>
                    </h2>
                    <button onClick={() => navigate("approvals")}>View all approvals</button>
                  </div>
                  {approvalCards(pending.slice(0, 3))}
                </section>
                <aside className="ow-card ow-event-focus">
                  <span>{demo ? "Sample event" : "Event in focus"}</span>
                  <h3>{data.events[0]?.title ?? "Your next community gathering"}</h3>
                  <p>{data.events[0]?.event_date ?? "Start with a goal and a proposed date."}</p>
                  <p>
                    {data.events[0]?.venue ??
                      "Your organizer can help compare venues and local partners."}
                  </p>
                  {demo && <p>142 RSVPs · 87% plan complete · sample figures</p>}
                  <button onClick={() => navigate(data.events.length ? "events" : "chat")}>
                    {data.events.length ? "Open event plan →" : "Plan a gathering →"}
                  </button>
                  <hr className="my-5" />
                  <h3>Human review comes first.</h3>
                  <p>
                    Your organizer prepares. You review posts, outreach, bookings, and payments
                    before any external action.
                  </p>
                </aside>
              </div>
              <div className="ow-stats">
                {(demo
                  ? [
                      ["142", "RSVPs"],
                      ["18", "Partners"],
                      ["87%", "Plan complete"],
                    ]
                  : [
                      [String(data.events.length), "Event plans"],
                      [String(data.vendorCount), "Saved vendors"],
                      [
                        String(data.tasks.filter((t) => t.status === "completed").length),
                        "Completed plans",
                      ],
                    ]
                ).map(([n, l]) => (
                  <div key={l}>
                    <strong>{n}</strong>
                    <span>
                      {l}
                      {demo ? " · sample" : ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="ow-two">
                <section className="ow-card">
                  <h2>Next steps</h2>
                  {!demo && (
                    <Link to="/planning" className="ow-link">
                      Manage community needs and plans →
                    </Link>
                  )}
                  {tasks}
                </section>
                <section className="ow-card">
                  <h2>Browser sessions</h2>
                  {data.sessions.length ? (
                    data.sessions.map((s) => (
                      <button
                        className="ow-session-link"
                        key={s.id}
                        onClick={() => navigate("browser")}
                      >
                        <Monitor size={18} />
                        <span>
                          <b>{s.task}</b>
                          <small>
                            {s.state.replaceAll("_", " ")}
                            {demo ? " · sample" : ""}
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))
                  ) : (
                    <p>No browser sessions yet. Open a supported website from Browser Sessions.</p>
                  )}
                </section>
              </div>
              <details className="ow-recent">
                <summary>Recent activity</summary>
                {activity}
              </details>
            </>
          )}
          {view === "chat" && (
            <div className="ow-chat-layout">
              <aside className="ow-threads">
                <p>Your conversations</p>
                {organizerThreads.map((t) => (
                  <button
                    key={t}
                    aria-pressed={thread === t}
                    onClick={() => {
                      setThread(t);
                      setChatSeed("");
                    }}
                  >
                    <MessageCircle size={16} />
                    {threadLabels[t]}
                  </button>
                ))}
              </aside>
              {demo ? (
                <DemoChat
                  key={thread}
                  thread={thread}
                  initialMessage={chatSeed}
                  onDraft={(c) => edit(undefined, c)}
                  sent={sampleNotes[thread]}
                  onSend={(message) =>
                    setSampleNotes((notes) => ({ ...notes, [thread]: [...notes[thread], message] }))
                  }
                />
              ) : (
                <OrganizerChat
                  key={`${thread}:${chatSeed}`}
                  thread={thread}
                  initialMessage={chatSeed}
                  onDraft={(c) => edit(undefined, c)}
                />
              )}
            </div>
          )}
          {view === "discover" &&
            (demo ? (
              <SampleDiscover />
            ) : (
              <>
                <OrganizerChat thread="discover" onDraft={(c) => edit(undefined, c)} />
                <details className="ow-recent">
                  <summary>Save local partners and prepare a plan</summary>
                  <LocalDiscoveryPanel />
                </details>
              </>
            ))}
          {view === "events" &&
            (demo ? (
              <>
                <h2>Neighborhood Resource Fair</h2>
                <p>Tucson · next month · sample event</p>
                <div className="ow-two">
                  <div className="ow-card">
                    <h3>Event plan</h3>
                    <p>Venue: to be confirmed</p>
                    <p>142 sample RSVPs · 18 sample partners</p>
                    <SampleChecklist />
                  </div>
                  <div className="ow-card">
                    <h3>Timeline & volunteers</h3>
                    <p>
                      Confirm venue → invite partners → open RSVPs → brief volunteers → follow up.
                    </p>
                    <button
                      onClick={() => {
                        setThread("volunteers");
                        navigate("chat");
                      }}
                    >
                      Plan volunteer roles
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <Events />
            ))}
          {view === "people" &&
            (demo ? (
              <SamplePeople />
            ) : (
              <>
                <h2>People & local partners</h2>
                <p className="ow-subtitle">
                  Your saved vendor contacts and research history. Partner and volunteer records are
                  not yet imported.
                </p>
                <VendorDirectory />
              </>
            ))}
          {view === "library" &&
            (demo ? (
              <div className="ow-card">
                <h2>Organization library · sample</h2>
                {[
                  "Community mission & voice",
                  "Resource Fair planning checklist",
                  "Venue comparison template",
                ].map((t) => (
                  <details key={t}>
                    <summary>{t}</summary>
                    <p>
                      {t === "Community mission & voice"
                        ? demoData.mission
                        : "Capture source, date checked, accessibility, contact details, and open questions. These are illustrative notes."}
                    </p>
                  </details>
                ))}
              </div>
            ) : (
              <OrganizationKnowledge />
            ))}
          {view === "browser" &&
            (demo ? (
              <DemoBrowser onReview={() => navigate("approvals")} />
            ) : data.webAgentId ? (
              <>
                <h2>Supervised browser</h2>
                <p className="ow-subtitle">
                  Supported public websites only. Account login, manual takeover, and publishing
                  remain unavailable until verified.
                </p>
                <PlatformBrowser agentId={data.webAgentId} />
              </>
            ) : (
              <Empty
                title="Choose your public-web organizer"
                text="Enable the public-web agent in Connectors to use supervised browser research."
                action={<button onClick={() => navigate("connectors")}>Open connectors</button>}
              />
            ))}
          {view === "connectors" &&
            (demo ? (
              <SampleConnectors />
            ) : (
              <>
                <h2>Connected platforms</h2>
                <p className="ow-subtitle">
                  Choosing a channel configures its research and drafts; it does not sign in or
                  enable publishing. LinkedIn and Google Calendar integrations are planned.
                </p>
                <PlatformAgents />
              </>
            ))}
          {view === "approvals" && (
            <>
              <div className="ow-section-title">
                <div>
                  <h2>Review before anything leaves your workspace</h2>
                  <p>
                    Approval records a decision about this exact draft. Publishing, booking, and
                    payment execution are not enabled.
                  </p>
                </div>
                <button disabled={!editor} onClick={() => edit()}>
                  New draft
                </button>
              </div>
              {!admin && (
                <p className="ow-notice">
                  Only an organization owner or administrator can approve or reject.
                </p>
              )}
              {approvalCards(pending)}
              {!demo && (
                <p className="ow-subtitle">
                  Event budgets and payment proposals retain their separate reviews in{" "}
                  <button className="ow-link" onClick={() => navigate("events")}>
                    Events
                  </button>
                  .
                </p>
              )}
              <button className="ow-link" onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? "Hide" : "Show"} review history
              </button>
              {showHistory && approvalCards(data.approvals.filter((a) => a.status !== "pending"))}
            </>
          )}
          {view === "activity" && (
            <>
              <h2>Organization activity</h2>
              <p className="ow-subtitle">
                Recorded actions and approval decisions. Most recent 100 entries.
              </p>
              {activity}
            </>
          )}
        </main>
      </div>
      {panel && (
        <aside className="ow-panel" aria-label="Organizer details">
          <div className="ow-panel-head">
            <h2>Your organizer</h2>
            <button aria-label="Close organizer details" onClick={() => setPanel(null)}>
              <X size={20} />
            </button>
          </div>
          <div className="ow-panel-tabs">
            {["Activity", "Approvals", "Upcoming", "Identity"].map((t) => (
              <button aria-pressed={panel === t} key={t} onClick={() => setPanel(t)}>
                {t}
              </button>
            ))}
          </div>
          {panel === "Activity" ? (
            activity
          ) : panel === "Approvals" ? (
            <>
              <p>{pending.length} pending drafts</p>
              <button
                onClick={() => {
                  navigate("approvals");
                  setPanel(null);
                }}
              >
                Review queue
              </button>
            </>
          ) : panel === "Upcoming" ? (
            tasks
          ) : (
            <>
              <h3>{data.name}</h3>
              <p>{data.mission}</p>
              <p>{data.area}</p>
              <p>
                Research & prepare: editors
                <br />
                Approve: administrators
                <br />
                Publish / message / spend: unavailable
              </p>
              {!demo && (
                <OrganizationBrief
                  next="research"
                  onNext={() => {
                    setPanel(null);
                    navigate("discover");
                  }}
                />
              )}
            </>
          )}
        </aside>
      )}
      {draft && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDraft(null);
          }}
        >
          <DialogContent className="ow-edit ow-dialog">
            <DialogTitle>{editing ? "Edit draft" : "Prepare for review"}</DialogTitle>
            <DialogDescription>
              Edits require a fresh approval. No external action is performed.
            </DialogDescription>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await save(draft, editing);
                  setDraft(null);
                  navigate("approvals");
                }, "Draft saved for review.");
              }}
            >
              <label>
                Title
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label>
                Action
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                >
                  {["post", "message", "booking", "payment"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Exact destination or recipient
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={draft.destination}
                  onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
                />
              </label>
              <label>
                Draft to review
                <textarea
                  required
                  minLength={10}
                  maxLength={10000}
                  rows={7}
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                />
              </label>
              <div className="ow-buttons">
                <button type="submit" disabled={busy}>
                  Save for review
                </button>
                <button type="button" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="ow-empty">
      <CheckCircle size={25} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function DemoChat({
  thread,
  initialMessage,
  onDraft,
  sent,
  onSend,
}: {
  thread: OrganizerThread;
  initialMessage: string;
  onDraft: (s: string) => void;
  sent: string[];
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  return (
    <div className="ow-chat-thread">
      <header>
        <h2>{threadLabels[thread]}</h2>
        <p>Sample conversation · no AI or browser calls</p>
      </header>
      <div className="ow-messages">
        <div className="ow-user-message">
          {thread === "main"
            ? "Help us organize a neighborhood resource fair in Tucson next month."
            : `Help with ${threadLabels[thread].toLowerCase()}.`}
        </div>
        <article className="ow-agent-message">
          <strong>Civi · sample organizer</strong>
          <p className="whitespace-pre-wrap">{demoReplies[thread]}</p>
          <button className="ow-link" onClick={() => onDraft(demoReplies[thread])}>
            Prepare a sample draft for review
          </button>
        </article>
        {sent.map((s, i) => (
          <article key={i}>
            <div className="ow-user-message">{s}</div>
            <p className="ow-agent-message">
              Demo note captured for this conversation. Open your signed-in workspace for live
              research and saved memory.
            </p>
          </article>
        ))}
      </div>
      <form
        className="ow-composer"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(message);
          setMessage("");
        }}
      >
        <label className="sr-only" htmlFor="sample-message">
          Message your organizer
        </label>
        <textarea
          id="sample-message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Try a direction in this sample conversation"
        />
        <div>
          <span>Demo only · nothing is sent</span>
          <button disabled={!message.trim()}>Add sample note</button>
        </div>
      </form>
    </div>
  );
}
function SampleChecklist() {
  const [checked, setChecked] = useState([true, true, false, false]);
  return (
    <div className="ow-checklist">
      {[
        "Define community goal",
        "Prepare partner shortlist",
        "Confirm venue and budget",
        "Approve invitations",
      ].map((s, i) => (
        <label key={s}>
          <input
            type="checkbox"
            checked={checked[i]}
            onChange={() => setChecked(checked.map((v, n) => (n === i ? !v : v)))}
          />
          {s}
        </label>
      ))}
      <small>Interactive sample checklist. The 87% headline is a fixed prototype figure.</small>
    </div>
  );
}
function SampleDiscover() {
  const [query, setQuery] = useState("");
  return (
    <>
      <h2>Discover your community</h2>
      <p className="ow-subtitle">
        Sample data · open your workspace for live Perplexity research. No research citations are
        invented here.
      </p>
      <label>
        Filter sample opportunities
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resources, venues, or partners"
        />
      </label>
      <div className="ow-three">
        {[
          "Community resource partners",
          "Accessible neighborhood venues",
          "Local food trucks and caterers",
        ]
          .filter((t) => t.toLowerCase().includes(query.toLowerCase()))
          .map((t) => (
            <article className="ow-card" key={t}>
              <Search size={22} />
              <h3>{t}</h3>
              <p>
                Explore fit for the Tucson resource fair. Names, availability, prices, and contacts
                need live research.
              </p>
              <small>Illustrative opportunity · not a verified lead</small>
            </article>
          ))}
      </div>
    </>
  );
}
function SamplePeople() {
  return (
    <>
      <h2>People & partners</h2>
      <p className="ow-subtitle">Illustrative roles, not real contacts or outreach.</p>
      <div className="ow-list">
        {[
          "Resource partner · Community services",
          "Volunteer coordinator · Event team",
          "Food truck contact · Vendor shortlist",
        ].map((t) => (
          <article key={t}>
            <Users size={20} />
            <span>
              <b>{t}</b>
              <small>Contact details not supplied · no messages sent</small>
            </span>
          </article>
        ))}
      </div>
    </>
  );
}
function SampleConnectors() {
  return (
    <>
      <h2>Connectors</h2>
      <p className="ow-subtitle">
        Sample setup · no account is connected. Production capabilities are verified per platform.
      </p>
      <div className="ow-three">
        {[
          "Facebook",
          "Instagram",
          "LinkedIn",
          "Google Calendar",
          "Eventbrite",
          "X",
          "Reddit",
          "Nextdoor",
        ].map((p) => (
          <article key={p} className="ow-card">
            <Plug size={22} />
            <h3>{p}</h3>
            <span>Not connected</span>
            <details>
              <summary>Permissions & availability</summary>
              <p>
                Research and draft preparation only. Login, background sync, sending, and publishing
                are not enabled in this demo.
              </p>
            </details>
          </article>
        ))}
      </div>
    </>
  );
}
function DemoBrowser({ onReview }: { onReview: () => void }) {
  const [state, setState] = useState("Awaiting approval");
  return (
    <>
      <h2>Browser Sessions</h2>
      <p className="ow-subtitle">
        Demo mode — no live browser connection. The production public-web browser uses Steel.
      </p>
      <div className="ow-browser-demo">
        <div className="ow-card">
          <h3>Prepare a Facebook Group post</h3>
          <p>Sample profile: facebook-org</p>
          <span className="ow-status">{state}</span>
          <div className="ow-buttons">
            <button
              disabled={state === "Stopped"}
              onClick={() => setState(state === "Paused" ? "Awaiting approval" : "Paused")}
            >
              {state === "Paused" ? "Resume sample" : "Pause sample"}
            </button>
            <button
              disabled={state === "Stopped"}
              onClick={() =>
                setState(state === "Manual sample" ? "Awaiting approval" : "Manual sample")
              }
            >
              {state === "Manual sample" ? "Hand back to organizer" : "Take over sample"}
            </button>
            <button onClick={() => setState("Stopped")}>Stop sample task</button>
          </div>
          <details>
            <summary>Sample steps</summary>
            <ol>
              <li>Opened sample group</li>
              <li>Prepared draft</li>
              <li>Paused for approval</li>
            </ol>
          </details>
        </div>
        <div className="ow-fake-browser">
          <div>facebook.com · illustrative page</div>
          <h3>Tucson Community Alliance</h3>
          <p>Group announcement · draft</p>
          <textarea
            aria-label="Sample browser draft"
            defaultValue={demoApprovals[0]!.content}
            readOnly={state !== "Manual sample"}
          />
          <button disabled={state === "Stopped"} onClick={onReview}>
            Review draft in Approvals
          </button>
          <small>Changing this mock page does not change a live website or approval draft.</small>
        </div>
      </div>
    </>
  );
}
