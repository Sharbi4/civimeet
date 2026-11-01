import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  HeartHandshake,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { WorkspaceGate, useWorkspace } from "@/components/workspace/WorkspaceGate";
import { OrganizationBrief } from "@/components/workspace/OrganizationBrief";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ResearchResult } from "@/lib/research";

export const Route = createFileRoute("/planning")({
  head: () => ({
    meta: [{ title: "Community Steward — CiviMeet" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <WorkspaceGate>
      <Dashboard />
    </WorkspaceGate>
  ),
});
type Need = {
  id: string;
  title: string;
  detail: string;
  kind: string;
  source_url: string;
  priority: string;
  status: string;
  created_at: string;
};
type Plan = {
  id: string;
  need_id: string | null;
  title: string;
  contribution: string;
  connection: string;
  gathering: string;
  follow_up: string;
  follow_up_on: string;
  status: string;
  revision: number;
  outcome: string;
};
type Run = {
  id: string;
  input: { question: string };
  status: string;
  result: ResearchResult | null;
  error: string | null;
  created_at: string;
};
type Feed = { id: string; action: string; created_at: string };
const tabs = ["Today", "Community needs", "Steward plans", "Research", "Activity"] as const;
type Tab = (typeof tabs)[number];
const localDate = () =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
const emptyPlan = () => ({
  need_id: "",
  title: "",
  contribution: "",
  connection: "",
  gathering: "Only consider a gathering if the community expresses interest.",
  follow_up: "Check whether the resource helped and record the next need.",
  follow_up_on: localDate(),
});
const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

function Dashboard() {
  const { db, organizationId, role } = useWorkspace();
  const editor = role !== "viewer";
  const admin = ["owner", "admin"].includes(role);
  const [tab, setTab] = useState<Tab>("Today");
  const [needs, setNeeds] = useState<Need[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [counts, setCounts] = useState({ open: 0, drafts: 0, due: 0, research: 0 });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [need, setNeed] = useState({
    title: "",
    detail: "",
    kind: "question",
    source: "",
    urgency: "normal",
  });
  const [plan, setPlan] = useState(emptyPlan);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [research, setResearch] = useState({
    question: "",
    location: "",
    purpose: "resources",
    planId: "",
    includeKnowledge: false,
  });
  const [requestId, setRequestId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 86400000).toISOString();
    const results = await Promise.all([
      db
        .from("community_needs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("steward_plans")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(100),
      db
        .from("steward_research_runs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("vendor_activity")
        .select("id,action,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("community_needs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "open"),
      db
        .from("steward_plans")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "draft"),
      db
        .from("steward_plans")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "approved")
        .lte("follow_up_on", localDate()),
      db
        .from("steward_research_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .gte("created_at", since),
    ]);
    const failure = results.find((result) => result.error)?.error;
    if (failure) throw new Error(failure.message);
    setNeeds((results[0]!.data ?? []) as Need[]);
    setPlans((results[1]!.data ?? []) as Plan[]);
    setRuns((results[2]!.data ?? []) as Run[]);
    setFeed((results[3]!.data ?? []) as Feed[]);
    setCounts({
      open: results[4]!.count ?? 0,
      drafts: results[5]!.count ?? 0,
      due: results[6]!.count ?? 0,
      research: results[7]!.count ?? 0,
    });
  }, [db, organizationId]);
  useEffect(() => {
    void load()
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load workspace."))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    let alive = true;
    fetch("/api/steward/research")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (alive) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (alive) setConfigured(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function mutate(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function rpc(name: string, parameters: Record<string, unknown>) {
    const result = await db.rpc(name, parameters);
    if (result.error) throw result.error;
  }
  function changeResearch(patch: Partial<typeof research>) {
    setResearch((value) => ({ ...value, ...patch }));
    setRequestId(null);
  }
  function planFor(item: Need) {
    setEditing(null);
    setPlan({
      ...emptyPlan(),
      need_id: item.id,
      title: item.title,
      contribution: `Research a useful, sourced response to this community need: ${item.title}`,
    });
    setTab("Steward plans");
  }
  async function runResearch() {
    const key = requestId ?? crypto.randomUUID();
    setRequestId(key);
    await mutate(async () => {
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Sign in again before running research.");
      const response = await fetch("/api/steward/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          ...research,
          planId: research.planId || null,
          organizationId,
          requestId: key,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        await load();
        throw new Error(body.error || "Research failed.");
      }
      if (body.run.status === "failed")
        throw new Error(body.run.error || "This attempt failed. Start a new attempt when ready.");
      if (body.run.status === "running")
        throw new Error(
          "This request is still running. Refresh history; retrying this same request will not spend twice.",
        );
    }, "Research saved with sources. A copy is available in shared knowledge.");
  }
  const upcoming = plans
    .filter((item) => item.status === "approved")
    .sort((a, b) => a.follow_up_on.localeCompare(b.follow_up_on))
    .slice(0, 5);
  return (
    <div className="space-y-6">
      <OrganizationBrief
        next={counts.drafts ? "review" : counts.due ? "followup" : "research"}
        onNext={() => setTab(counts.drafts || counts.due ? "Steward plans" : "Research")}
      />
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white md:p-9">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="relative flex flex-wrap justify-between gap-5">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
              <Compass size={16} /> Community Steward
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Be useful. Build connection.
              <br />
              Bring people together.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
              Your community's needs, knowledge, and next commitments in one place. Start with a
              helpful contribution. Let gatherings grow from real interest.
            </p>
          </div>
          <div className="self-end rounded-xl border border-white/15 bg-white/5 p-4 text-sm">
            <p className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-300" /> Your next contribution
            </p>
            <p className="mt-2 max-w-52 text-xs leading-5 text-slate-400">
              Start with a community need. Review the plan, then decide the next step.
            </p>
          </div>
        </div>
        <div className="relative mt-7 flex flex-wrap gap-2 text-xs text-blue-100">
          {["01 / Contribute", "02 / Connect", "03 / Meet Up", "04 / Follow through"].map(
            (stage) => (
              <span key={stage} className="rounded-full border border-blue-300/20 px-3 py-2">
                {stage}
              </span>
            ),
          )}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Open community needs",
            value: counts.open,
            target: "Community needs" as Tab,
            icon: MessageCircle,
          },
          {
            label: "Plans awaiting review",
            value: counts.drafts,
            target: "Steward plans" as Tab,
            icon: BookOpen,
          },
          {
            label: "Follow-ups due",
            value: counts.due,
            target: "Steward plans" as Tab,
            icon: HeartHandshake,
          },
          {
            label: "Research briefs · 24 hours",
            value: counts.research,
            target: "Research" as Tab,
            icon: Search,
          },
        ].map((metric) => (
          <button
            key={metric.label}
            onClick={() => setTab(metric.target)}
            className="rounded-xl border bg-card p-5 text-left transition hover:border-primary"
          >
            <metric.icon size={18} className="text-primary" />
            <p className="mt-4 text-3xl font-semibold">{loading ? "—" : metric.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{metric.label}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <nav aria-label="Steward dashboard" className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <Button
              key={item}
              variant={tab === item ? "default" : "ghost"}
              onClick={() => setTab(item)}
            >
              {item}
            </Button>
          ))}
        </nav>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void mutate(load, "Workspace refreshed.")}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border bg-muted p-4 text-sm">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading your community workspace…</p>
      ) : (
        <>
          {tab === "Today" && (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <section className="space-y-4 rounded-xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Where you can help next</h3>
                  <Sparkles size={18} className="text-primary" />
                </div>
                {needs
                  .filter((n) => n.status === "open")
                  .slice(0, 5)
                  .map((item) => (
                    <article key={item.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-primary">
                          {item.kind}
                          {item.priority === "high" ? " · High priority" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">Recorded by your team</span>
                      </div>
                      <h4 className="mt-2 font-medium">{item.title}</h4>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {item.detail}
                      </p>
                      {editor && (
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          onClick={() => planFor(item)}
                        >
                          Prepare a helpful response <ArrowRight size={14} />
                        </Button>
                      )}
                    </article>
                  ))}
                {!counts.open && (
                  <div className="rounded-lg border border-dashed p-7 text-center">
                    <MessageCircle className="mx-auto text-primary" />
                    <h4 className="mt-3 font-medium">Start with what your community needs</h4>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      Record a question, a useful resource request, a concern, or genuine interest
                      in gathering. Nothing is imported from social accounts yet.
                    </p>
                    <Button className="mt-4" onClick={() => setTab("Community needs")}>
                      Open community needs
                    </Button>
                  </div>
                )}
              </section>
              <div className="space-y-6">
                <section className="rounded-xl border bg-card p-6">
                  <h3 className="text-lg font-semibold">Keep your commitments</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Upcoming commitments from your recent approved plans.
                  </p>
                  {upcoming.map((item) => (
                    <button
                      key={item.id}
                      className="mt-4 block w-full rounded-lg border p-3 text-left"
                      onClick={() => setTab("Steward plans")}
                    >
                      <span className="text-xs text-primary">{item.follow_up_on}</span>
                      <p className="mt-1 text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.follow_up}</p>
                    </button>
                  ))}
                  {!upcoming.length && (
                    <p className="mt-5 text-sm text-muted-foreground">
                      No approved follow-ups yet. Add a date when you draft your first plan.
                    </p>
                  )}
                </section>
                <section className="rounded-xl border bg-card p-6">
                  <h3 className="font-semibold">Your community knowledge</h3>
                  <div className="mt-4 grid gap-3 text-sm text-primary">
                    <Link to="/knowledge">Shared knowledge and useful resources →</Link>
                    <Link to="/vendors">Vendor directory and source history →</Link>
                    <Link to="/events">Gatherings, vendors, and budgets →</Link>
                    <Link to="/platform-agents">Community channels →</Link>
                  </div>
                </section>
              </div>
            </div>
          )}
          {tab === "Community needs" && (
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
              {editor && (
                <form
                  className="space-y-4 rounded-xl border bg-card p-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate(async () => {
                      await rpc("record_community_need", {
                        workspace: organizationId,
                        need_title: need.title,
                        need_detail: need.detail,
                        need_kind: need.kind,
                        source: need.source,
                        urgency: need.urgency,
                      });
                      setNeed({
                        title: "",
                        detail: "",
                        kind: "question",
                        source: "",
                        urgency: "normal",
                      });
                    }, "Community need recorded.");
                  }}
                >
                  <h3 className="text-lg font-semibold">Listen first</h3>
                  <p className="text-sm text-muted-foreground">
                    Record useful context without private member details. These are team
                    observations, not automated social monitoring.
                  </p>
                  <Field label="Community need">
                    <Input
                      required
                      minLength={3}
                      maxLength={200}
                      value={need.title}
                      onChange={(e) => setNeed({ ...need, title: e.target.value })}
                    />
                  </Field>
                  <Field label="What did the community share?">
                    <Textarea
                      maxLength={4000}
                      rows={4}
                      value={need.detail}
                      onChange={(e) => setNeed({ ...need, detail: e.target.value })}
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      className={selectClass}
                      value={need.kind}
                      onChange={(e) => setNeed({ ...need, kind: e.target.value })}
                    >
                      {["question", "resource", "concern", "gathering", "celebration"].map(
                        (value) => (
                          <option key={value}>{value}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Source link (optional)">
                    <Input
                      type="url"
                      maxLength={2048}
                      value={need.source}
                      onChange={(e) => setNeed({ ...need, source: e.target.value })}
                    />
                  </Field>
                  <Field label="Priority">
                    <select
                      className={selectClass}
                      value={need.urgency}
                      onChange={(e) => setNeed({ ...need, urgency: e.target.value })}
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                  <Button disabled={busy}>Record need</Button>
                </form>
              )}
              <section className="space-y-3">
                <h3 className="font-semibold">Community inbox · Latest 100</h3>
                {!needs.length && (
                  <Empty text="No needs recorded yet. Start with a question your community is asking." />
                )}
                {needs.map((item) => (
                  <article key={item.id} className="rounded-xl border bg-card p-5">
                    <p className="text-xs text-primary">
                      {item.kind} · {item.status} · {item.priority}
                    </p>
                    <h4 className="mt-2 font-semibold">{item.title}</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {item.detail}
                    </p>
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block text-sm text-primary underline"
                      >
                        View source
                      </a>
                    )}
                    {editor && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => planFor(item)}>
                          Create plan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () =>
                                rpc("resolve_community_need", {
                                  target_need: item.id,
                                  resolved: item.status !== "resolved",
                                }),
                              "Need updated.",
                            )
                          }
                        >
                          {item.status === "resolved" ? "Reopen" : "Mark resolved"}
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            </div>
          )}
          {tab === "Steward plans" && (
            <div className="space-y-6">
              {editor && (
                <form
                  className="rounded-xl border bg-card p-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate(async () => {
                      await rpc("save_steward_plan", {
                        workspace: organizationId,
                        plan,
                        target_plan: editing?.id ?? null,
                        expected_revision: editing?.revision ?? null,
                      });
                      setEditing(null);
                      setPlan(emptyPlan());
                    }, "Plan saved as a draft. Review is required before marking it complete.");
                  }}
                >
                  <div className="mb-5 flex justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {editing ? "Edit your plan" : "Design a useful contribution"}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        A structured team-authored plan. Editing resets approval. Approval here
                        reviews the plan; it does not send messages or authorize purchases.
                      </p>
                    </div>
                    {editing && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditing(null);
                          setPlan(emptyPlan());
                        }}
                      >
                        Cancel edit
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Plan title">
                      <Input
                        required
                        minLength={3}
                        maxLength={200}
                        value={plan.title}
                        onChange={(e) => setPlan({ ...plan, title: e.target.value })}
                      />
                    </Field>
                    <Field label="Community need">
                      <select
                        className={selectClass}
                        value={plan.need_id}
                        onChange={(e) => setPlan({ ...plan, need_id: e.target.value })}
                      >
                        <option value="">General community support</option>
                        {needs.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {(
                      [
                        ["contribution", "1. Contribute — what useful help will you offer?"],
                        ["connection", "2. Connect — what resource or relationship could help?"],
                        [
                          "gathering",
                          "3. Meet Up — what shared interest could become an in-person gathering?",
                        ],
                        ["follow_up", "4. Follow through — what will you check back on?"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <Textarea
                          required={key === "contribution" || key === "follow_up"}
                          minLength={
                            key === "contribution" ? 10 : key === "follow_up" ? 3 : undefined
                          }
                          maxLength={4000}
                          rows={3}
                          value={plan[key]}
                          onChange={(e) => setPlan({ ...plan, [key]: e.target.value })}
                        />
                      </Field>
                    ))}
                    <Field label="Follow-up date">
                      <Input
                        type="date"
                        required
                        value={plan.follow_up_on}
                        onChange={(e) => setPlan({ ...plan, follow_up_on: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Button className="mt-5" disabled={busy}>
                    Save draft plan
                  </Button>
                </form>
              )}
              <h3 className="font-semibold">Plan workspace · Latest 100</h3>
              {!plans.length && (
                <Empty text="No plans yet. Begin with a community need and a useful contribution." />
              )}
              <div className="grid gap-5 lg:grid-cols-2">
                {plans.map((item) => (
                  <article key={item.id} className="space-y-4 rounded-xl border bg-card p-6">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-primary">
                        {item.status} · Follow up {item.follow_up_on}
                      </p>
                      <h4 className="mt-2 text-xl font-semibold">{item.title}</h4>
                    </div>
                    {(
                      [
                        ["contribution", "Contribute"],
                        ["connection", "Connect"],
                        ["gathering", "Meet Up"],
                        ["follow_up", "Follow through"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {item[key] || "Not specified"}
                        </p>
                      </div>
                    ))}
                    {item.outcome && (
                      <div className="rounded-lg bg-muted p-4">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 size={16} /> What we learned
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm">{item.outcome}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {editor && item.status !== "completed" && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEditing(item);
                            setPlan({
                              need_id: item.need_id ?? "",
                              title: item.title,
                              contribution: item.contribution,
                              connection: item.connection,
                              gathering: item.gathering,
                              follow_up: item.follow_up,
                              follow_up_on: item.follow_up_on,
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit plan
                        </Button>
                      )}
                      {editor && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            changeResearch({
                              planId: item.id,
                              question: `What reliable resources would help this community plan: ${item.title}?`,
                            });
                            setTab("Research");
                          }}
                        >
                          Research this plan
                        </Button>
                      )}
                      {admin && item.status === "draft" && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () =>
                                rpc("review_steward_plan", {
                                  target_plan: item.id,
                                  expected_revision: item.revision,
                                  decision: "approve",
                                }),
                              "Plan approved. Your team can now follow through and record the outcome.",
                            )
                          }
                        >
                          Approve plan
                        </Button>
                      )}
                    </div>
                    {admin && item.status === "approved" && (
                      <form
                        className="space-y-3 border-t pt-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void mutate(
                            () =>
                              rpc("review_steward_plan", {
                                target_plan: item.id,
                                expected_revision: item.revision,
                                decision: "complete",
                                result_note: outcomes[item.id] ?? "",
                              }),
                            "Outcome recorded. Review the community need and any next follow-up.",
                          );
                        }}
                      >
                        <Field label="What actually happened, and what should we remember?">
                          <Textarea
                            required
                            minLength={10}
                            maxLength={4000}
                            value={outcomes[item.id] ?? ""}
                            onChange={(e) =>
                              setOutcomes({ ...outcomes, [item.id]: e.target.value })
                            }
                          />
                        </Field>
                        <Button disabled={busy}>Record outcome and complete</Button>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
          {tab === "Research" && (
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
              <div className="space-y-4">
                <div className="rounded-xl border bg-card p-5">
                  <h3 className="font-semibold">Find useful answers</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {configured === true
                      ? "Ask a question to find useful resources, vendors, and practical next steps. Saved results appear here with their sources."
                      : configured === false
                        ? "Research needs setup. Your administrator can finish connecting the research service."
                        : "Research availability could not be checked. Please refresh this page."}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Research is limited to 10 requests per day for your organization. Unsuccessful
                    attempts count toward this allowance.
                  </p>
                </div>
                {editor && (
                  <form
                    className="space-y-4 rounded-xl border bg-card p-6"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void runResearch();
                    }}
                  >
                    <h3 className="text-lg font-semibold">Ground the next contribution</h3>
                    <Field label="Research question">
                      <Textarea
                        required
                        minLength={10}
                        maxLength={3000}
                        rows={4}
                        value={research.question}
                        onChange={(e) => changeResearch({ question: e.target.value })}
                      />
                    </Field>
                    <Field label="Location">
                      <Input
                        maxLength={160}
                        value={research.location}
                        onChange={(e) => changeResearch({ location: e.target.value })}
                        placeholder="City or service area"
                      />
                    </Field>
                    <Field label="Purpose">
                      <select
                        className={selectClass}
                        value={research.purpose}
                        onChange={(e) => changeResearch({ purpose: e.target.value })}
                      >
                        {["resources", "vendors", "venues", "events", "general"].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Related plan">
                      <select
                        className={selectClass}
                        value={research.planId}
                        onChange={(e) => changeResearch({ planId: e.target.value })}
                      >
                        <option value="">No plan selected</option>
                        {plans.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={research.includeKnowledge}
                        onChange={(e) => changeResearch({ includeKnowledge: e.target.checked })}
                      />
                      Use recent shared knowledge to inform this research
                    </label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Your question and selected context are sent to Perplexity. Keep private member
                      information out. Results are saved for your organization; no outreach is sent.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy || configured !== true}>
                        {busy ? "Researching and saving…" : "Run research"}
                      </Button>
                      {requestId && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setRequestId(null);
                            setNotice(
                              "New attempt prepared. Running it uses another research request.",
                            );
                          }}
                        >
                          Prepare new attempt
                        </Button>
                      )}
                    </div>
                  </form>
                )}
              </div>
              <section className="space-y-4">
                <h3 className="font-semibold">Saved research · Latest 30</h3>
                {!runs.length && (
                  <Empty text="Your saved research and useful sources will appear here." />
                )}
                {runs.map((item) => (
                  <article key={item.id} className="rounded-xl border bg-card p-5">
                    <p className="text-xs text-primary">
                      {item.status === "running" &&
                      Date.now() - Date.parse(item.created_at) > 180000
                        ? "Research interrupted · Try again"
                        : item.status}{" "}
                      · {new Date(item.created_at).toLocaleString()}
                    </p>
                    <h4 className="mt-2 font-semibold">{item.input.question}</h4>
                    {item.error && <p className="mt-3 text-sm text-destructive">{item.error}</p>}
                    {item.result && (
                      <>
                        <p className="mt-3 text-xs text-muted-foreground">
                          {item.result.model} · Reported cost{" "}
                          {item.result.usage.costUsd == null
                            ? "unavailable"
                            : `$${item.result.usage.costUsd.toFixed(4)}`}
                        </p>
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
                          {item.result.answer}
                        </p>
                        <div className="mt-4 space-y-2 border-t pt-3">
                          {item.result.sources.map((source) => (
                            <a
                              key={source.id}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block break-words text-sm text-primary underline"
                            >
                              [{source.id}] {source.title}
                            </a>
                          ))}
                          {!item.result.sources.length && (
                            <p className="text-sm text-muted-foreground">
                              No source links returned. Verify claims before relying on this answer.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </section>
            </div>
          )}
          {tab === "Activity" && (
            <section className="rounded-xl border bg-card p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Activity size={18} /> Organization activity · Latest 30
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Recent contributions, planning decisions, and progress from your organization.
              </p>
              {!feed.length && <Empty text="Your organization's saved actions will appear here." />}
              <ol className="mt-5 divide-y">
                {feed.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm">
                    <span>{item.action.replaceAll("_", " ")}</span>
                    <time className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col items-stretch gap-2 leading-5">
      <span>{label}</span>
      {children}
    </Label>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed p-6 text-sm leading-6 text-muted-foreground">
      {text}
    </p>
  );
}
