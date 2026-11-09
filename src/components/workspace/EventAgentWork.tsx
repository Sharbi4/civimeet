import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Sprout, CheckCircle2, Search } from "lucide-react";
import { useWorkspace } from "./WorkspaceGate";
import { Button } from "@/components/ui/button";
type Work = {
  id: string;
  objective: string;
  status: string;
  skill_id: string;
  predecessor_id: string | null;
  result: string;
  lease_until: string | null;
};
export function EventAgentWork({ eventId }: { eventId: string }) {
  const { db, organizationId, role } = useWorkspace();
  const [tasks, setTasks] = useState<Work[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pause = useRef(false);
  const mounted = useRef(true);
  const editor = ["owner", "admin", "organizer"].includes(role);
  const load = useCallback(async () => {
    const r = await db
      .from("agent_work_items")
      .select("id,objective,status,skill_id,predecessor_id,result,lease_until")
      .eq("organization_id", organizationId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (r.error) throw Error("Could not load the agent's saved work.");
    const rows = (r.data ?? []) as Work[];
    if (mounted.current) setTasks(rows);
    return rows;
  }, [db, organizationId, eventId]);
  useEffect(() => {
    mounted.current = true;
    void load().catch((e) => setError(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 5000);
    return () => {
      mounted.current = false;
      pause.current = true;
      clearInterval(timer);
    };
  }, [load]);
  async function run(create = false, retryId?: string) {
    if (busy || !editor) return;
    setBusy(true);
    setError("");
    setNotice("");
    pause.current = false;
    try {
      if (create) {
        const r = await db.rpc("queue_event_groundwork", { target_event: eventId });
        if (r.error) throw Error(r.error.message);
      }
      if (retryId) {
        const r = await db.rpc("retry_agent_research", { target_task: retryId });
        if (r.error) throw Error(r.error.message);
      }
      // Bounded to the two explicitly queued research skills. No hidden recurring work.
      for (let step = 0; step < 2 && !pause.current && mounted.current; step++) {
        const rows = await load();
        const eligible = rows
          .filter(
            (t) =>
              (t.status === "queued" ||
                (t.status === "running" &&
                  t.lease_until &&
                  Date.parse(t.lease_until) < Date.now())) &&
              (!t.predecessor_id ||
                rows.some((p) => p.id === t.predecessor_id && p.status === "completed")),
          )
          .sort((a, b) =>
            a.skill_id === "community_presence" ? -1 : b.skill_id === "community_presence" ? 1 : 0,
          );
        const task = eligible[0];
        if (!task) break;
        const { data } = await db.auth.getSession();
        if (!data.session) throw Error("Sign in again to continue.");
        const response = await fetch("/api/agent/work", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ organizationId, taskId: task.id }),
          signal: AbortSignal.timeout(180000),
        });
        const body = await response.json();
        if (!response.ok) throw Error(body.error ?? body.result ?? "Agent work needs review.");
        if (response.status === 202) {
          setNotice(body.message);
          break;
        }
      }
      if (mounted.current) {
        await load();
        setNotice(
          pause.current
            ? "Paused after the current task. Remaining work is saved for later."
            : "Work status saved. Review the research and vendor candidates below.",
        );
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Work was interrupted; refresh saved status before retrying.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const pending = tasks.some((t) => t.status === "queued" || t.status === "running");
  return (
    <section
      className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 space-y-4"
      aria-label="Event agent work"
    >
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Sprout size={20} />
          Put your community agent to work
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Research the event's local communities, then find vendors using that context. Findings
          stay in your organization's knowledge and vendor directory.
        </p>
      </div>
      {editor && (
        <div className="flex flex-wrap gap-3">
          {busy ? (
            <Button
              variant="outline"
              onClick={() => {
                pause.current = true;
                setNotice("The current research will finish; the next task will wait.");
              }}
            >
              <Pause size={16} />
              Pause after this task
            </Button>
          ) : (
            <Button onClick={() => void run(!pending)}>
              <Play size={16} />
              {pending ? "Continue saved work" : "Start event groundwork"}
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <article className="rounded-lg border bg-white p-4" key={task.id}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {task.status === "completed" ? <CheckCircle2 size={17} /> : <Search size={17} />}{" "}
                {task.skill_id === "community_presence"
                  ? "Community presence"
                  : "Local vendor discovery"}
                <span className="ml-auto text-xs font-normal">{task.status}</span>
              </div>
              {task.result && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer">View saved outcome</summary>
                  <p className="mt-2 whitespace-pre-wrap">{task.result}</p>
                </details>
              )}
              {editor && task.status === "failed" && !busy && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void run(false, task.id)}
                >
                  Retry failed task
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Research and drafts only; no posting, joining, messaging, or payments. Keep this workspace
        open to progress to the next task. Closing it leaves remaining work queued; a research
        request already started may still finish.
      </p>
    </section>
  );
}
