import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  MessageCircle,
  CalendarDays,
  Activity,
  Monitor,
  X,
  ArrowRight,
  Inbox,
  Search,
  Users,
} from "lucide-react";
import { useWorkspace } from "./WorkspaceGate";
import { ActionTurn, OrganizerChat } from "./OrganizerChat";
import { PlatformBrowser, useInlineBrowser } from "./BrowserDock";
import { LocalDiscoveryPanel } from "./LocalDiscoveryPanel";
import { OrganizationBrief } from "./OrganizationBrief";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Events } from "@/routes/events";
import { VendorDirectory } from "@/routes/vendors";
import { OrganizationKnowledge } from "@/routes/knowledge";
import { PlatformAgents } from "@/routes/platform-agents";
import { DemoConnectors, LiveConnectors } from "./Connectors";
import { AgentPanel, type PanelActivity, type PanelMemory } from "./AgentPanel";
import { ChatBrowser } from "./ChatBrowser";
import { DemoPlansProvider, LivePlansProvider, PlanCard } from "./AgentPlans";
import { ChatActionsProvider, useChatActions } from "./ChatActions";
import { parseChatIntent } from "@/lib/chat-intents";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WorkspaceRail,
  railViews,
  type RailArtifact,
  type RailChat,
  type RailView,
} from "./WorkspaceRail";
import {
  AgentLibrary,
  FeedView,
  GoalsView,
  IdeasView,
  SearchView,
  type AgentWork,
  type FeedEntry,
  type SearchItem,
} from "./WorkspaceViews";
import { connectors as connectorCatalog } from "@/lib/connectors";
import {
  chatLabel,
  demoApprovals,
  demoReplies,
  isPlatformThread,
  organizerThreads,
  platformThread,
  threadLabels,
  type ChatThread,
  type ReviewItem,
} from "@/lib/organizer";
import "./organizer.css";

type View = RailView;
const views = railViews;
type Task = {
  id: string;
  title: string;
  follow_up: string;
  follow_up_on: string;
  status: string;
  contribution?: string;
  gathering?: string;
};
type ResearchItem = {
  id: string;
  input: { question?: string; threadKey?: string };
  result: { answer?: string; sources?: { url: string }[] } | null;
  created_at: string;
};
type Need = {
  id: string;
  title: string;
  detail: string;
  kind: string;
  priority: string;
  created_at: string;
};
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
  goal: string;
  connected: string[];
  research: ResearchItem[];
  needs: Need[];
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
  goal: "",
  connected: [],
  research: [],
  needs: [],
};
const demoData: WorkspaceData = {
  ...blank,
  name: "Tucson Community Alliance",
  mission: "Connect Tucson residents to food, housing, health, and library resources.",
  area: "Tucson, AZ",
  vendorCount: 18,
  goal: "Host a Neighborhood Resource Fair next month that connects 200 residents with food, housing and health partners.",
  connected: ["facebook", "google_calendar"],
  research: [
    {
      id: "r1",
      input: { question: "Which Tucson food banks run mobile pantries near Reid Park?" },
      result: {
        answer:
          "Community Food Bank of Southern Arizona runs weekly mobile pantries on the south side; two stops are within a mile of Reid Park. Hours and eligibility should be confirmed before promoting.",
        sources: [{ url: "https://www.communityfoodbank.org/" }],
      },
      created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
  ],
  needs: [
    {
      id: "n1",
      title: "Families asking where to find weekend meals",
      detail: "Several neighbors in the Midvale Park group asked about Saturday food options.",
      kind: "question",
      priority: "high",
      created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    },
    {
      id: "n2",
      title: "Seniors want help signing up for utility assistance",
      detail: "",
      kind: "resource",
      priority: "normal",
      created_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    },
  ],
  approvals: demoApprovals,
  tasks: [
    {
      id: "task1",
      title: "Confirm venue requirements",
      contribution: "Compare accessible spaces for 200 people near bus lines.",
      follow_up: "Compare accessible spaces for 200 people.",
      follow_up_on: "Next week · sample",
      status: "draft",
    },
    {
      id: "task2",
      title: "Prepare volunteer briefing",
      contribution: "A short volunteer guide with roles, shifts and a welcome script.",
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
  // The agent panel beside the chat replaces the floating browser dock here.
  useInlineBrowser();
  const [data, setData] = useState(blank);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const r = await Promise.all([
      db.from("organizations").select("name").eq("id", organizationId).single(),
      db
        .from("organization_briefs")
        .select("mission,area,event_goal")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db
        .from("steward_plans")
        .select("id,title,follow_up,follow_up_on,status,contribution,gathering")
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
      db
        .from("organization_connectors")
        .select("connector")
        .eq("organization_id", organizationId)
        .eq("status", "connected"),
      db
        .from("steward_research_runs")
        .select("id,input,result,created_at")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(12),
      db
        .from("community_needs")
        .select("id,title,detail,kind,priority,created_at")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20),
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
      goal: r[1].data?.event_goal ?? "",
      connected: ((r[9].data ?? []) as { connector: string }[]).map((row) => row.connector),
      research: (r[10].data ?? []) as ResearchItem[],
      needs: (r[11].data ?? []) as Need[],
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
      access={{ db, organizationId }}
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
  /** Signed-in database access for tools run from chat (absent in the demo). */
  access?: { db: SupabaseClient; organizationId: string } | undefined;
};
function OrganizerWorkspace({
  data,
  demo,
  role,
  error,
  loading,
  refresh,
  review,
  save,
  access,
}: Props) {
  // Signing in lands on the agent chat; the overview stays one click away.
  const [view, setView] = useState<View>("chat");
  const [railOpen, setRailOpen] = useState(true);
  useEffect(() => {
    const saved = window.localStorage.getItem("civimeet.rail");
    if (saved) setRailOpen(saved === "open");
    else if (window.innerWidth < 900) setRailOpen(false);
  }, []);
  const toggleRail = () =>
    setRailOpen((open) => {
      window.localStorage.setItem("civimeet.rail", open ? "closed" : "open");
      return !open;
    });
  useEffect(() => {
    // Official sign-ins return to /dashboard?view=connectors.
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested && views.some(([id]) => id === requested)) setView(requested as View);
  }, []);
  const [thread, setThread] = useState<ChatThread>("main");
  const [panel, setPanel] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<ReviewItem>();
  const [chatSeed, setChatSeed] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState("");
  const [sampleNotes, setSampleNotes] = useState<Record<string, string[]>>({});
  const pending = data.approvals.filter((a) => a.status === "pending");
  const admin = role === "admin" || role === "owner";
  const editor = role !== "viewer";
  // Every connected community or events platform gets its own agent conversation.
  const platformChats: RailChat[] = connectorCatalog
    .filter(
      (item) =>
        (item.category === "social" || item.category === "events") &&
        data.connected.includes(item.id),
    )
    .map((item) => ({
      id: platformThread(item.id),
      label: `${item.name} Agent`,
      connector: item.id,
    }));
  const chats: RailChat[] = [{ id: "main", label: threadLabels.main }, ...platformChats];
  const topics: RailChat[] = organizerThreads
    .filter((item) => item !== "main")
    .map((item) => ({ id: item, label: threadLabels[item] }));
  const platformName = isPlatformThread(thread)
    ? connectorCatalog.find((item) => platformThread(item.id) === thread)?.name
    : undefined;
  const agentWork: AgentWork[] = [
    ...data.approvals.map((a) => ({ id: a.id, title: a.title, kind: a.kind, text: a.content })),
    ...data.research.map((r) => ({
      id: r.id,
      title: r.input.question ?? "Research brief",
      kind: "research",
      text: r.result?.answer ?? "",
      time: r.created_at,
    })),
  ];
  const recent: RailArtifact[] = agentWork
    .slice(0, 6)
    .map(({ id, title, kind }) => ({ id, title, kind }));
  const stamp = (iso: string) => (Number.isNaN(Date.parse(iso)) ? 0 : Date.parse(iso));
  const feed: FeedEntry[] = [
    ...data.research.map((r) => ({
      id: `r-${r.id}`,
      kind: "research" as const,
      label: "Research",
      title: r.input.question ?? "Research brief",
      text: (r.result?.answer ?? "").slice(0, 400),
      url: r.result?.sources?.[0]?.url,
      time: r.created_at,
    })),
    ...data.needs.map((n) => ({
      id: `n-${n.id}`,
      kind: "need" as const,
      label: n.kind === "question" ? "Community question" : "Community need",
      title: n.title,
      text: n.detail,
      time: n.created_at,
    })),
    ...data.activity.slice(0, 8).map((a) => ({
      id: `a-${a.id}`,
      kind: "activity" as const,
      label: "Workspace",
      title: a.action.replaceAll("_", " "),
      text: "",
      time: a.created_at,
    })),
  ].sort((x, y) => stamp(y.time) - stamp(x.time));
  const searchItems: SearchItem[] = [
    ...data.events.map((e) => ({
      id: e.id,
      type: "Event",
      title: e.title,
      detail: `${e.event_date} · ${e.venue}`,
      open: () => navigate("events"),
    })),
    ...data.tasks.map((t) => ({
      id: t.id,
      type: "Idea",
      title: t.title,
      detail: t.follow_up,
      open: () => navigate("ideas"),
    })),
    ...data.approvals.map((a) => ({
      id: a.id,
      type: "Draft",
      title: a.title,
      detail: a.destination,
      open: () => navigate("approvals"),
    })),
    ...data.research.map((r) => ({
      id: r.id,
      type: "Research",
      title: r.input.question ?? "Research brief",
      detail: (r.result?.answer ?? "").slice(0, 120),
      open: () => navigate("library"),
    })),
    ...data.needs.map((n) => ({
      id: n.id,
      type: "Need",
      title: n.title,
      detail: n.detail,
      open: () => navigate("goals"),
    })),
  ];
  // The agent panel beside the chat is scoped to whichever agent you're talking to.
  // Side by side on wide screens; a slide-over drawer below 1280px so it never covers the chat.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelOpen = wide ? sideOpen : drawerOpen;
  const setPanelOpen = (open: boolean) => (wide ? setSideOpen(open) : setDrawerOpen(open));
  useEffect(() => {
    // Approvals, activity and memory open the panel; the browser itself lives above the chat.
    const show = (event: Event) => {
      if ((event as CustomEvent<{ tab?: string }>).detail?.tab === "browser") return;
      if (wide) setSideOpen(true);
      else setDrawerOpen(true);
    };
    window.addEventListener("civimeet:panel", show);
    return () => window.removeEventListener("civimeet:panel", show);
  }, [wide]);
  const mentions = (text: string) =>
    platformName ? text.toLowerCase().includes(platformName.toLowerCase()) : true;
  const panelApprovals = data.approvals.filter(
    (a) => !platformName || mentions(`${a.title} ${a.destination} ${a.content}`),
  );
  const threadResearch = data.research.filter((r) =>
    isPlatformThread(thread)
      ? r.input.threadKey === thread
      : !r.input.threadKey || !r.input.threadKey.startsWith("platform_"),
  );
  const panelActivity: PanelActivity[] = [
    ...threadResearch.map((r) => ({
      id: `r-${r.id}`,
      kind: "research" as const,
      title: r.input.question ?? "Research",
      detail: (r.result?.answer ?? "").slice(0, 160),
      time: r.created_at,
    })),
    ...panelApprovals
      .filter((a) => a.status !== "pending" && a.reviewed_at)
      .map((a) => ({
        id: `d-${a.id}`,
        kind: "decision" as const,
        title: `${a.status === "approved" ? "Approved" : "Declined"}: ${a.title}`,
        detail: a.destination,
        time: a.reviewed_at!,
      })),
    ...(isPlatformThread(thread)
      ? []
      : data.activity.slice(0, 10).map((a) => ({
          id: `w-${a.id}`,
          kind: "workspace" as const,
          title: a.action.replaceAll("_", " "),
          detail: "",
          time: a.created_at,
        }))),
  ].sort((x, y) => stamp(y.time) - stamp(x.time));
  const mainMemory: PanelMemory[] = [
    ...(data.goal ? [{ id: "goal", kind: "fact", content: `Goal: ${data.goal}` }] : []),
    {
      id: "mission",
      kind: "fact",
      content: `Mission: ${data.mission}${data.area ? ` · ${data.area}` : ""}`,
    },
    ...threadResearch.slice(0, 6).map((r) => ({
      id: `m-${r.id}`,
      kind: "conversation_summary",
      content: `Asked: ${r.input.question ?? ""}\nLearned: ${(r.result?.answer ?? "").slice(0, 300)}`,
      time: r.created_at,
    })),
  ];
  const openArtifact = (item: { id: string; kind: string }) =>
    navigate(data.approvals.some((a) => a.id === item.id) ? "approvals" : "library");
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
  const PlansProvider = demo ? DemoPlansProvider : LivePlansProvider;
  return (
    <PlansProvider
      navigate={navigate}
      approvalsKey={data.approvals.map((a) => `${a.id}:${a.status}`).join(",")}
    >
      <ChatActionsProvider
        workspace={{
          db: access?.db ?? null,
          organizationId: access?.organizationId ?? null,
          role,
          demo,
          approvalsPending: pending.length,
          navigate,
          openChatThread: (next) => {
            setThread(next as ChatThread);
            setChatSeed("");
            navigate("chat");
          },
        }}
      >
        <div className="ow-app">
          <WorkspaceRail
            view={view}
            onNavigate={navigate}
            expanded={railOpen}
            onToggle={toggleRail}
            organization={data.name}
            area={data.area}
            pending={pending.length}
            chats={chats}
            topics={topics}
            activeChat={thread}
            onChat={(id) => {
              setThread(id as ChatThread);
              setChatSeed("");
              navigate("chat");
            }}
            recent={recent}
            onArtifact={openArtifact}
            onIdentity={() => setPanel("Identity")}
            footer={{
              title: demo ? "Sample administrator" : role === "organizer" ? "Editor" : role,
              detail: demo ? "Demo workspace" : "Organization workspace",
            }}
          />
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
                      !data.tasks.some((t) =>
                        t.title.toLowerCase().includes(search.toLowerCase()),
                      ) &&
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
                <span>
                  No live accounts, messages, bookings, or payments. Changes reset on reload.
                </span>
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
                      <p>
                        {data.events[0]?.event_date ?? "Start with a goal and a proposed date."}
                      </p>
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
                        <p>
                          No browser sessions yet. Open a supported website from Browser Sessions.
                        </p>
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
                <div
                  className={`grid min-h-0 ${wide && panelOpen ? "grid-cols-[minmax(0,1fr)_420px]" : ""}`}
                >
                  <div className="ow-chat-stack relative min-w-0">
                    <ChatBrowser
                      key={`browser:${thread}`}
                      thread={thread}
                      connector={
                        isPlatformThread(thread) ? thread.slice("platform_".length) : undefined
                      }
                      demo={demo}
                      admin={admin}
                      connected={data.connected}
                      webAgentId={data.webAgentId}
                      onShowPanel={panelOpen ? undefined : () => setPanelOpen(true)}
                    />
                    {demo ? (
                      <DemoChat
                        key={thread}
                        thread={thread}
                        platformName={platformName}
                        initialMessage={chatSeed}
                        onDraft={(c) => edit(undefined, c)}
                        sent={sampleNotes[thread] ?? []}
                        onSend={(message) =>
                          setSampleNotes((notes) => ({
                            ...notes,
                            [thread]: [...(notes[thread] ?? []), message],
                          }))
                        }
                      />
                    ) : (
                      <OrganizerChat
                        key={`${thread}:${chatSeed}`}
                        thread={thread}
                        platformName={platformName}
                        initialMessage={chatSeed}
                        onDraft={(c) => edit(undefined, c)}
                        onOpenEvents={() => navigate("events")}
                      />
                    )}
                  </div>
                  {panelOpen && (
                    <div
                      className={
                        wide
                          ? "h-[calc(100dvh-125px)] min-h-[540px] border-l border-[#e4e9ec]"
                          : "fixed inset-y-0 right-0 z-50 w-[min(420px,100vw)] border-l border-[#e4e9ec] shadow-[-16px_0_40px_-20px_rgba(15,23,42,.35)]"
                      }
                    >
                      <AgentPanel
                        key={thread}
                        demo={demo}
                        label={chatLabel(thread, platformName)}
                        connector={
                          isPlatformThread(thread) ? thread.slice("platform_".length) : undefined
                        }
                        platformName={platformName}
                        approvals={panelApprovals}
                        activity={panelActivity}
                        mainMemory={mainMemory}
                        admin={admin}
                        webAgentId={data.webAgentId}
                        browserInChat
                        onReview={review}
                        onEdit={(item) => edit(item)}
                        onOpenConnections={() => navigate("connectors")}
                        onClose={() => setPanelOpen(false)}
                      />
                    </div>
                  )}
                  {panelOpen && !wide && (
                    <button
                      type="button"
                      aria-label="Close agent panel"
                      onClick={() => setPanelOpen(false)}
                      className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
                    />
                  )}
                </div>
              )}
              {view === "search" && (
                <SearchView items={searchItems}>
                  {demo ? (
                    <SampleDiscover />
                  ) : (
                    <>
                      <OrganizerChat thread="discover" onDraft={(c) => edit(undefined, c)} />
                      <details className="ow-recent">
                        <summary>Save local partners and prepare a plan</summary>
                        <LocalDiscoveryPanel />
                      </details>
                    </>
                  )}
                </SearchView>
              )}
              {view === "feed" && <FeedView entries={feed} demo={demo} onDiscuss={openChat} />}
              {view === "ideas" && (
                <IdeasView
                  ideas={data.tasks
                    .filter((t) => t.status !== "completed")
                    .map((t) => ({
                      id: t.id,
                      title: t.title,
                      contribution: t.contribution || t.follow_up,
                      gathering: t.gathering ?? "",
                      followUpOn: t.follow_up_on,
                      status: t.status,
                    }))}
                  demo={demo}
                  onDevelop={openChat}
                  onEvent={() => navigate("events")}
                />
              )}
              {view === "goals" && (
                <GoalsView
                  mission={data.mission}
                  goal={data.goal}
                  area={data.area}
                  stats={
                    demo
                      ? [
                          ["142", "RSVPs"],
                          ["18", "Partners"],
                          ["87%", "Plan complete"],
                          [String(platformChats.length), "Platforms live"],
                        ]
                      : [
                          [String(data.events.length), "Event plans"],
                          [String(data.vendorCount), "Saved vendors"],
                          [String(platformChats.length), "Platforms live"],
                          [String(pending.length), "Awaiting review"],
                        ]
                  }
                  needs={data.needs}
                  demo={demo}
                  onEdit={() => setPanel("Identity")}
                  onDiscuss={openChat}
                />
              )}
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
                          Confirm venue → invite partners → open RSVPs → brief volunteers → follow
                          up.
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
                      Your saved vendor contacts and research history. Partner and volunteer records
                      are not yet imported.
                    </p>
                    <VendorDirectory />
                  </>
                ))}
              {view === "library" && (
                <AgentLibrary work={agentWork} demo={demo} onOpen={openArtifact} />
              )}
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
                  <DemoConnectors />
                ) : (
                  <>
                    <LiveConnectors />
                    <details className="mx-auto mt-10 max-w-[980px] rounded-2xl border border-slate-200 bg-white px-5 py-4">
                      <summary className="cursor-pointer text-[14px] font-medium text-slate-700">
                        Agent playbooks and memory per platform
                      </summary>
                      <div className="mt-4">
                        <PlatformAgents />
                      </div>
                    </details>
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
                  {showHistory &&
                    approvalCards(data.approvals.filter((a) => a.status !== "pending"))}
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
                        navigate("search");
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
      </ChatActionsProvider>
    </PlansProvider>
  );
}
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="ow-empty">
      <Inbox size={25} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function DemoChat({
  thread,
  platformName,
  initialMessage,
  onDraft,
  sent,
  onSend,
}: {
  thread: ChatThread;
  platformName?: string | undefined;
  initialMessage: string;
  onDraft: (s: string) => void;
  sent: string[];
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const actions = useChatActions();
  const label = chatLabel(thread, platformName);
  // The sample conversation also opens on its most recent message.
  const scroller = useRef<HTMLDivElement>(null);
  const sampleCount = sent.length + (actions?.demoActions.length ?? 0);
  const sampleLast = actions?.demoActions.at(-1)?.status ?? "";
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [thread, sampleCount, sampleLast]);
  const reply = isPlatformThread(thread)
    ? `This week on ${platformName ?? "this platform"}, I’d share the mobile pantry schedule in two neighborhood groups, answer the weekend-meals question in Midvale Park with sourced options, and invite partners to the Resource Fair once the venue is confirmed.\n\nFirst draft is ready for your review. Nothing is posted until you approve it.`
    : demoReplies[thread];
  return (
    <div className="ow-chat-thread">
      <header>
        <h2>{label}</h2>
        <p>Sample conversation · no AI or browser calls</p>
      </header>
      <div className="ow-messages" ref={scroller}>
        <div className="ow-user-message">
          {thread === "main"
            ? "Help us organize a neighborhood resource fair in Tucson next month."
            : isPlatformThread(thread)
              ? `What should we do on ${platformName ?? "this platform"} this week?`
              : `Help with ${label.toLowerCase()}.`}
        </div>
        <article className="ow-agent-message">
          <strong>Civi · sample organizer</strong>
          <p className="whitespace-pre-wrap">{reply}</p>
          <button className="ow-link" onClick={() => onDraft(reply)}>
            Prepare a sample draft for review
          </button>
        </article>
        {thread === "main" && (
          <>
            <div className="ow-user-message">
              We also want to start a community for single parents in Tucson with monthly meetups.
              Start from scratch.
            </div>
            <article className="ow-agent-message">
              <strong>Civi · sample organizer</strong>
              <p className="whitespace-pre-wrap">
                Let’s build it. I’m researching the single-parent groups already active in Tucson
                and drafting a name, description and rules for a new Facebook group. Creating the
                group and publishing anything will wait for your approval.
              </p>
              <PlanCard planId="sample-plan" />
            </article>
          </>
        )}
        {sent.map((s, i) => (
          <article key={i}>
            <div className="ow-user-message">{s}</div>
            <p className="ow-agent-message">
              Demo note captured for this conversation. Open your signed-in workspace for live
              research and saved memory.
            </p>
          </article>
        ))}
        {actions?.demoActions
          .filter((item) => item.thread_key === thread)
          .map((item) => (
            <ActionTurn
              key={item.id}
              action={item}
              busy={false}
              onContinue={onSend}
              onRetry={() => {}}
            />
          ))}
      </div>
      <form
        className="ow-composer"
        onSubmit={(e) => {
          e.preventDefault();
          // Tool instructions work in the sample too, with simulated outcomes.
          const intent = parseChatIntent(message);
          if (intent && actions) void actions.run(intent, message, thread);
          else onSend(message);
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
