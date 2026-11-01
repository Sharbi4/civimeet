import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Pause, Play, RotateCcw, Square } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { useWorkspace } from "./WorkspaceGate";
import { getConnector } from "@/lib/connectors";

export type PlanTask = {
  id: string;
  plan_id: string;
  position: number;
  title: string;
  detail: string;
  agent: string;
  kind: string;
  level: "research" | "prepare" | "communicate" | "commit";
  depends_on: number[];
  status: "queued" | "working" | "waiting_approval" | "blocked" | "done" | "failed" | "cancelled";
  status_detail: string;
  result: {
    summary?: string;
    sources?: { id: number; title: string; url: string }[];
    approvalId?: string;
    eventId?: string;
    needs?: string;
    connector?: string;
  } | null;
  lease_until: string | null;
  updated_at: string;
};
export type AgentPlan = {
  id: string;
  title: string;
  goal: string;
  status: "active" | "paused" | "completed" | "cancelled";
  thread_key: string;
  created_at: string;
  tasks: PlanTask[];
};
type Navigate = (view: "approvals" | "connectors" | "events") => void;
type PlansValue = {
  plans: AgentPlan[];
  demo: boolean;
  canEdit: boolean;
  control: (planId: string, action: "pause" | "resume" | "cancel") => Promise<void>;
  retry: (taskId: string) => Promise<void>;
  navigate: Navigate;
};
const PlansContext = createContext<PlansValue | null>(null);
export const usePlans = () => useContext(PlansContext);

const leaseLive = (task: PlanTask) =>
  Boolean(task.lease_until && Date.parse(task.lease_until) > Date.now());
const depsDone = (plan: AgentPlan, task: PlanTask) =>
  task.depends_on.every(
    (position) => plan.tasks.find((item) => item.position === position)?.status === "done",
  );
/** A plan has work the runner can pick up right now. */
export function runnable(plan: AgentPlan) {
  if (plan.status !== "active") return false;
  if (plan.tasks.some((task) => task.status === "working" && leaseLive(task))) return false;
  return plan.tasks.some(
    (task) =>
      (task.status === "queued" && depsDone(plan, task)) ||
      (task.status === "working" && !leaseLive(task)),
  );
}

export function LivePlansProvider({
  children,
  navigate,
  approvalsKey,
}: {
  children: ReactNode;
  navigate: Navigate;
  approvalsKey: string;
}) {
  const { db, organizationId, role } = useWorkspace();
  const canEdit = role !== "viewer";
  const [plans, setPlans] = useState<AgentPlan[]>([]);
  const load = useCallback(async () => {
    const { data } = await db
      .from("agent_plans")
      .select(
        "id,title,goal,status,thread_key,created_at,agent_tasks(id,plan_id,position,title,detail,agent,kind,level,depends_on,status,status_detail,result,lease_until,updated_at)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(12);
    setPlans(
      ((data ?? []) as (Omit<AgentPlan, "tasks"> & { agent_tasks: PlanTask[] })[]).map(
        ({ agent_tasks, ...plan }) => ({
          ...plan,
          tasks: [...(agent_tasks ?? [])].sort((a, b) => a.position - b.position),
        }),
      ),
    );
  }, [db, organizationId]);
  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 200);
    };
    const channel = db
      .channel(`plans:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_tasks",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_plans",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .subscribe();
    // New plans arrive from chat replies; poll lightly in case realtime is unavailable.
    const poll = setInterval(() => void load(), 15_000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      void db.removeChannel(channel);
    };
  }, [db, organizationId, load]);

  // The runner advances one step at a time while the workspace is open. Each call claims a
  // step on the server with a lease, so several open tabs never run the same step twice.
  const running = useRef(false);
  const idleUntil = useRef<Record<string, number>>({});
  const run = useCallback(
    async (planId: string) => {
      const { data } = await db.auth.getSession();
      if (!data.session) return null;
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId, planId }),
      });
      const body = (await response.json().catch(() => ({}))) as { ran?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Agent work could not run.");
      return body.ran ?? null;
    },
    [db, organizationId],
  );
  useEffect(() => {
    if (!canEdit || running.current) return;
    const next = plans.find(
      (plan) => runnable(plan) && (idleUntil.current[plan.id] ?? 0) < Date.now(),
    );
    if (!next) return;
    running.current = true;
    void run(next.id)
      .then((ran) => {
        // Nothing claimable (for example the daily research allowance): wait before asking again.
        if (!ran) idleUntil.current[next.id] = Date.now() + 60_000;
      })
      .catch(() => {
        idleUntil.current[next.id] = Date.now() + 30_000;
      })
      .finally(() => {
        running.current = false;
        void load();
      });
  }, [plans, canEdit, run, load]);
  // When an approval is decided, let waiting steps move on.
  useEffect(() => {
    if (!canEdit) return;
    for (const plan of plans)
      if (plan.status === "active" && plan.tasks.some((task) => task.status === "waiting_approval"))
        void run(plan.id)
          .then(() => load())
          .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalsKey]);

  const value = useMemo<PlansValue>(
    () => ({
      plans,
      demo: false,
      canEdit,
      navigate,
      async control(planId, action) {
        const { error } = await db.rpc("control_agent_plan", { target_plan: planId, action });
        if (error) throw new Error(error.message);
        await load();
      },
      async retry(taskId) {
        const { error } = await db.rpc("retry_agent_task", { target_task: taskId });
        if (error) throw new Error(error.message);
        await load();
      },
    }),
    [plans, canEdit, navigate, db, load],
  );
  return <PlansContext.Provider value={value}>{children}</PlansContext.Provider>;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const samplePlan = (): AgentPlan => ({
  id: "sample-plan",
  title: "Tucson single parents community",
  goal: "Start a community for single parents in Tucson and host monthly meetups.",
  status: "active",
  thread_key: "main",
  created_at: minutesAgo(12),
  tasks: [
    {
      id: "s1",
      plan_id: "sample-plan",
      position: 1,
      title: "Research single-parent communities in Tucson",
      detail: "",
      agent: "main",
      kind: "research",
      level: "research",
      depends_on: [],
      status: "done",
      status_detail: "Research saved with 8 sources.",
      result: {
        summary:
          "Sample: several active parent groups exist, but none focus on single parents on the south side. Parents ask most about childcare swaps and weekend activities.",
      },
      lease_until: null,
      updated_at: minutesAgo(9),
    },
    {
      id: "s2",
      plan_id: "sample-plan",
      position: 2,
      title: "Draft the group name, description and rules",
      detail: "",
      agent: "facebook",
      kind: "draft_content",
      level: "prepare",
      depends_on: [1],
      status: "done",
      status_detail: "Draft ready for your review in Approvals. Not published.",
      result: { approvalId: "sample-post" },
      lease_until: null,
      updated_at: minutesAgo(6),
    },
    {
      id: "s3",
      plan_id: "sample-plan",
      position: 3,
      title: "Find family-friendly meetup spaces",
      detail: "",
      agent: "main",
      kind: "find_venues",
      level: "research",
      depends_on: [],
      status: "working",
      status_detail: "",
      result: null,
      lease_until: minutesAgo(-2),
      updated_at: minutesAgo(1),
    },
    {
      id: "s4",
      plan_id: "sample-plan",
      position: 4,
      title: "Create the Facebook group",
      detail: "",
      agent: "facebook",
      kind: "platform_action",
      level: "communicate",
      depends_on: [2],
      status: "waiting_approval",
      status_detail: "Waiting for your approval to create group on Facebook.",
      result: { approvalId: "sample-post", needs: "approval" },
      lease_until: null,
      updated_at: minutesAgo(5),
    },
    {
      id: "s5",
      plan_id: "sample-plan",
      position: 5,
      title: "Draft the first meetup invitation",
      detail: "",
      agent: "facebook",
      kind: "draft_content",
      level: "prepare",
      depends_on: [3],
      status: "queued",
      status_detail: "",
      result: null,
      lease_until: null,
      updated_at: minutesAgo(12),
    },
  ],
});
export function DemoPlansProvider({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate: Navigate;
  approvalsKey?: string;
}) {
  const [plans, setPlans] = useState<AgentPlan[]>(() => [samplePlan()]);
  const value = useMemo<PlansValue>(
    () => ({
      plans,
      demo: true,
      canEdit: true,
      navigate,
      async control(planId, action) {
        setPlans((current) =>
          current.map((plan) =>
            plan.id !== planId
              ? plan
              : action === "cancel"
                ? {
                    ...plan,
                    status: "cancelled",
                    tasks: plan.tasks.map((task) =>
                      ["done", "failed"].includes(task.status)
                        ? task
                        : { ...task, status: "cancelled", status_detail: "Stopped by the team." },
                    ),
                  }
                : { ...plan, status: action === "pause" ? "paused" : "active" },
          ),
        );
      },
      async retry() {},
    }),
    [plans, navigate],
  );
  return <PlansContext.Provider value={value}>{children}</PlansContext.Provider>;
}

function planState(plan: AgentPlan) {
  if (plan.status === "paused")
    return { label: "Paused", tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  if (plan.status === "cancelled")
    return { label: "Stopped", tone: "bg-slate-100 text-slate-500", dot: "bg-slate-300" };
  if (plan.status === "completed")
    return { label: "Finished", tone: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  if (plan.tasks.some((task) => task.status === "working"))
    return { label: "Working", tone: "bg-blue-50 text-blue-700", dot: "bg-blue-500 animate-pulse" };
  if (plan.tasks.some((task) => ["waiting_approval", "blocked", "failed"].includes(task.status)))
    return { label: "Needs you", tone: "bg-amber-50 text-amber-800", dot: "bg-amber-500" };
  return { label: "Up next", tone: "bg-blue-50 text-blue-700", dot: "bg-blue-400" };
}
const levelLabel: Record<PlanTask["level"], string> = {
  research: "Research",
  prepare: "Prepare",
  communicate: "Needs approval",
  commit: "Needs approval",
};

function AgentMark({ agent, size = 22 }: { agent: string; size?: number }) {
  return getConnector(agent) ? (
    <BrandLogo id={agent} size={size} className="!rounded-md" />
  ) : (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-[#064cff]"
      style={{ width: size, height: size }}
    >
      <img
        src="/brand/civimeet-mark.svg"
        alt=""
        className="brightness-0 invert"
        style={{ width: size * 0.62, height: size * 0.62 }}
      />
    </span>
  );
}

function TaskStatus({ plan, task }: { plan: AgentPlan; task: PlanTask }) {
  const waitingOn = task.depends_on.filter(
    (position) => plan.tasks.find((item) => item.position === position)?.status !== "done",
  );
  const map: Record<PlanTask["status"], [string, string]> = {
    working: ["Working on it", "text-blue-700"],
    queued: [
      plan.status === "paused"
        ? "Paused"
        : waitingOn.length
          ? `Waiting on step ${waitingOn.join(", ")}`
          : "Up next",
      "text-slate-500",
    ],
    waiting_approval: ["Needs your approval", "text-amber-700"],
    blocked: ["Needs you", "text-amber-700"],
    done: ["Done", "text-emerald-700"],
    failed: ["Failed", "text-red-600"],
    cancelled: ["Stopped", "text-slate-400"],
  };
  const [text, tone] = map[task.status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${tone}`}>
      {task.status === "working" ? (
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        <span
          className={`h-2 w-2 rounded-full ${
            task.status === "done"
              ? "bg-emerald-500"
              : task.status === "failed"
                ? "bg-red-500"
                : ["waiting_approval", "blocked"].includes(task.status)
                  ? "bg-amber-500"
                  : "bg-slate-300"
          }`}
          aria-hidden="true"
        />
      )}
      {text}
    </span>
  );
}

function TaskRow({ plan, task, value }: { plan: AgentPlan; task: PlanTask; value: PlansValue }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const result = task.result;
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };
  const expandable = Boolean(result?.summary || result?.sources?.length);
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <AgentMark agent={task.agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="!mb-0 text-[14px] font-medium text-[#142d40]">{task.title}</p>
            <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#64717a]">
              {levelLabel[task.level]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <TaskStatus plan={plan} task={task} />
            {task.status_detail && (
              <span className="text-[12px] text-[#64717a]">{task.status_detail}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {expandable && (
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#0640d4] hover:bg-[#edf3ff]"
              >
                {open ? "Hide" : task.kind === "draft_content" ? "Preview" : "See what it found"}
                <ChevronDown size={12} className={open ? "rotate-180" : ""} />
              </button>
            )}
            {result?.approvalId && (
              <button
                type="button"
                onClick={() => value.navigate("approvals")}
                className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#0640d4] hover:bg-[#edf3ff]"
              >
                Review in Approvals
              </button>
            )}
            {result?.needs === "connection" && (
              <button
                type="button"
                onClick={() => value.navigate("connectors")}
                className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#0640d4] hover:bg-[#edf3ff]"
              >
                Connect {getConnector(result.connector ?? "")?.name ?? "the account"}
              </button>
            )}
            {result?.eventId && (
              <button
                type="button"
                onClick={() => value.navigate("events")}
                className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#0640d4] hover:bg-[#edf3ff]"
              >
                Open in Events
              </button>
            )}
            {["failed", "blocked"].includes(task.status) &&
              value.canEdit &&
              plan.status !== "cancelled" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void action(() => value.retry(task.id))}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#475569] hover:bg-slate-100"
                >
                  <RotateCcw size={12} /> Retry
                </button>
              )}
          </div>
          {open && (
            <div className="mt-2 rounded-xl bg-[#f8fafb] p-3 text-[13px] text-[#334155]">
              {result?.summary && (
                <p className="!mb-2 line-clamp-[12] whitespace-pre-wrap">{result.summary}</p>
              )}
              {Boolean(result?.sources?.length) && (
                <ul className="space-y-0.5 text-[12px]">
                  {result!.sources!.slice(0, 6).map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0640d4] hover:underline"
                      >
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** A plan as it unfolds: every step, who owns it, and its verified status. */
export function PlanCard({ planId }: { planId: string }) {
  const value = usePlans();
  const plan = value?.plans.find((item) => item.id === planId);
  const [confirmStop, setConfirmStop] = useState(false);
  if (!value || !plan) return null;
  const state = planState(plan);
  const done = plan.tasks.filter((task) => task.status === "done").length;
  return (
    <section
      aria-label={`Plan: ${plan.title}`}
      className="mt-3 rounded-2xl border border-[#e4e9ec] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="!mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8191a3]">
            Plan{value.demo ? " · sample" : ""}
          </p>
          <h3 className="!m-0 text-[15px] font-semibold text-[#142d40]">{plan.title}</h3>
          <p className="!mb-0 mt-0.5 text-[12px] text-[#64717a]">
            {done} of {plan.tasks.length} steps done
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${state.tone}`}
          >
            <span className={`h-2 w-2 rounded-full ${state.dot}`} />
            {state.label}
          </span>
          {value.canEdit && ["active", "paused"].includes(plan.status) && (
            <>
              <button
                type="button"
                onClick={() =>
                  void value.control(plan.id, plan.status === "active" ? "pause" : "resume")
                }
                aria-label={plan.status === "active" ? "Pause plan" : "Resume plan"}
                title={plan.status === "active" ? "Pause" : "Resume"}
                className="rounded-lg p-1.5 text-[#475569] hover:bg-slate-100"
              >
                {plan.status === "active" ? <Pause size={15} /> : <Play size={15} />}
              </button>
              {confirmStop ? (
                <button
                  type="button"
                  onClick={() => void value.control(plan.id, "cancel")}
                  className="rounded-lg px-2 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50"
                >
                  Stop plan?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmStop(true)}
                  aria-label="Stop plan"
                  title="Stop"
                  className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                >
                  <Square size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </header>
      <ol className="mt-2 divide-y divide-[#eef2f5]">
        {plan.tasks.map((task) => (
          <TaskRow key={task.id} plan={plan} task={task} value={value} />
        ))}
      </ol>
    </section>
  );
}

/** "What Civi is doing" for the agent panel: working now, needs you, up next, recently done. */
export function PlanSummary({ agent }: { agent?: string | undefined }) {
  const value = usePlans();
  if (!value) return null;
  const tasks = value.plans
    .filter(
      (plan) => plan.status === "active" || plan.status === "paused" || plan.status === "completed",
    )
    .flatMap((plan) => plan.tasks.map((task) => ({ plan, task })))
    .filter(({ task }) => !agent || agent === "main" || task.agent === agent);
  const groups: [string, typeof tasks][] = [
    ["Working now", tasks.filter(({ task }) => task.status === "working")],
    [
      "Needs you",
      tasks.filter(({ task }) => ["waiting_approval", "blocked", "failed"].includes(task.status)),
    ],
    [
      "Up next",
      tasks
        .filter(({ plan, task }) => task.status === "queued" && plan.status === "active")
        .slice(0, 4),
    ],
    [
      "Done",
      tasks
        .filter(({ task }) => task.status === "done")
        .slice(-4)
        .reverse(),
    ],
  ];
  if (!tasks.length) return null;
  return (
    <div className="mb-6 space-y-4">
      {groups.map(([title, rows]) =>
        rows.length ? (
          <section key={title}>
            <h3 className="!mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8191a3]">
              {title}
            </h3>
            <ul className="space-y-2">
              {rows.map(({ plan, task }) => (
                <li
                  key={task.id}
                  className="flex items-start gap-2.5 rounded-xl border border-[#eef2f5] p-2.5"
                >
                  <AgentMark agent={task.agent} size={20} />
                  <div className="min-w-0">
                    <p className="!mb-0.5 text-[13px] font-medium leading-snug text-[#142d40]">
                      {task.title}
                    </p>
                    <p className="!mb-0 truncate text-[11px] text-[#8191a3]">
                      {task.status_detail || plan.title}
                    </p>
                  </div>
                  {task.status === "working" && (
                    <span
                      className="ml-auto mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
