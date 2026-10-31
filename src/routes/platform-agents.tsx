import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorkspaceGate, useWorkspace } from "@/components/workspace/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { platformLabels, type PlatformAgent } from "@/lib/vendors";
import { platformPlaybooks, buildPlatformInstructions } from "@/lib/platform-playbooks";

export const Route = createFileRoute("/platform-agents")({
  head: () => ({
    meta: [{ title: "Platform Agents — CiviMeet" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <WorkspaceGate>
      <PlatformAgents />
    </WorkspaceGate>
  ),
});

type Memory = {
  id: string;
  memory_key: string;
  kind: string;
  content: string;
  source_url: string;
  updated_at: string;
  expires_at: string | null;
};
type Work = {
  id: string;
  objective: string;
  status: string;
  result: string;
  attempts: number;
  updated_at: string;
  lease_until: string | null;
};

function PlatformAgents() {
  const { db, organizationId, role } = useWorkspace();
  const administrator = ["owner", "admin"].includes(role);
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [selected, setSelected] = useState<PlatformAgent | null>(null);
  const [memory, setMemory] = useState<Memory[]>([]);
  const [work, setWork] = useState<Work[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [token, setToken] = useState("");
  const [objective, setObjective] = useState("");

  useEffect(() => {
    let alive = true;
    db.from("platform_agents")
      .select("*")
      .eq("organization_id", organizationId)
      .order("platform")
      .then(({ data, error: failure }) => {
        if (!alive) return;
        setLoading(false);
        if (failure) setError(failure.message);
        else setAgents((data ?? []) as PlatformAgent[]);
      });
    return () => {
      alive = false;
    };
  }, [db, organizationId, refresh]);

  const selectedId = selected?.id;
  useEffect(() => {
    setMemory([]);
    setWork([]);
    setToken("");
    setObjective("");
    if (!selectedId) return;
    let alive = true;
    Promise.all([
      db
        .from("agent_memory")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("agent_id", selectedId)
        .order("updated_at", { ascending: false })
        .limit(50),
      db
        .from("agent_work_items")
        .select("id,objective,status,result,attempts,updated_at,lease_until")
        .eq("organization_id", organizationId)
        .eq("agent_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]).then(([memories, tasks]) => {
      if (!alive) return;
      if (memories.error || tasks.error)
        setError(memories.error?.message ?? tasks.error?.message ?? "Could not load agent state.");
      else {
        setMemory((memories.data ?? []) as Memory[]);
        setWork((tasks.data ?? []) as Work[]);
      }
    });
    return () => {
      alive = false;
    };
  }, [db, organizationId, selectedId, refresh]);

  async function configure() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const { error: failure } = await db.rpc("configure_platform_agent", {
      target_agent: selected.id,
      agent_name: selected.name,
      agent_instructions: selected.instructions,
      is_paused: selected.paused,
    });
    setBusy(false);
    if (failure) setError(failure.message);
    else {
      setNotice("Agent settings saved.");
      setRefresh((value) => value + 1);
    }
  }

  async function rotateToken() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setToken("");
    const { data, error: failure } = await db.rpc("rotate_platform_agent_token", {
      target_agent: selected.id,
    });
    setBusy(false);
    if (failure) setError(failure.message);
    else setToken(data as string);
  }

  async function selectPlatform(enabled: boolean) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const { error: failure } = await db.rpc("select_organization_platform", {
      target_agent: selected.id,
      is_selected: enabled,
    });
    setBusy(false);
    if (failure) setError(failure.message);
    else {
      setSelected({ ...selected, selected: enabled });
      setToken("");
      setNotice(
        enabled
          ? "Platform selected for this organization. Account authorization still needs setup."
          : "Platform removed from this organization's choices. Worker access is revoked; saved knowledge is retained.",
      );
      setRefresh((value) => value + 1);
    }
  }

  async function enqueue() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const { error: failure } = await db.rpc("enqueue_agent_work", {
      target_agent: selected.id,
      task_objective: objective,
    });
    setBusy(false);
    if (failure) setError(failure.message);
    else {
      setNotice("Work queued for this agent. A connected worker is required to execute it.");
      setObjective("");
      setRefresh((value) => value + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Your organization's platforms</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose any combination of X.com, Eventbrite, Facebook, Reddit, Nextdoor, and Instagram.
          Choices apply only to this organization. Public web research is available separately.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Give each channel a clear purpose: contribute useful information, build relationships, and
          help turn real community interest into well-organized gatherings.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose the platforms that matter to your community. Account connections and automatic
          activity are not available yet.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading agents…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {agents.map((agent) => (
            <button
              key={agent.id}
              disabled={busy}
              className={`rounded-lg border p-5 text-left ${selected?.id === agent.id ? "border-primary" : ""}`}
              onClick={() => {
                setSelected(agent);
                setNotice("");
                setError("");
              }}
            >
              <p className="text-xs uppercase tracking-wide text-primary">
                {platformLabels[agent.platform]}
              </p>
              <h3 className="mt-2 font-semibold">{agent.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {platformPlaybooks[agent.platform].mission}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {!agent.selected
                  ? "Not selected"
                  : agent.platform !== "web"
                    ? "Selected · Account connection needs setup"
                    : "Public web research selected"}
                {agent.paused && " · Paused"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {agent.last_collection_at
                  ? `Last vendor discovery: ${new Date(agent.last_collection_at).toLocaleString()}`
                  : "No discoveries yet"}
              </p>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="space-y-6 rounded-lg border p-6">
          <div className="flex justify-between gap-3">
            <h3 className="text-xl font-semibold">{selected.name}</h3>
            <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>
              Refresh activity
            </Button>
          </div>
          {selected.platform !== "web" && (
            <section className="space-y-3 rounded-md border bg-muted p-4">
              <h4 className="font-semibold">{platformLabels[selected.platform]} connection</h4>
              <p className="text-sm text-muted-foreground">
                {selected.selected
                  ? "Selected for this organization. "
                  : "This platform is optional. "}
                Account authorization is not available yet. Selecting a platform does not sign in,
                grant account access, or start collecting information.
              </p>
              {administrator && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void selectPlatform(!selected.selected)}
                >
                  {selected.selected ? "Remove platform selection" : "Select for this organization"}
                </Button>
              )}
            </section>
          )}
          <section className="space-y-4">
            <h4 className="font-semibold">How this channel will help your community</h4>
            <p className="text-sm text-muted-foreground">
              {platformPlaybooks[selected.platform].personality}
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {platformPlaybooks[selected.platform].contributions.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
            <p className="text-sm">
              <strong>When it's time to gather:</strong>{" "}
              {platformPlaybooks[selected.platform].events}
            </p>
          </section>
          {administrator && (
            <details className="space-y-5 border-t pt-5">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Administrator settings
              </summary>
              <p className="text-sm text-muted-foreground">
                {platformPlaybooks[selected.platform].access}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setSelected({
                    ...selected,
                    instructions: buildPlatformInstructions(selected.platform),
                  })
                }
              >
                Load recommended steward instructions
              </Button>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void configure();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Agent name</Label>
                  <Input
                    id="agent-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={selected.name}
                    disabled={!administrator}
                    onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-instructions">Organization and platform instructions</Label>
                  <Textarea
                    id="agent-instructions"
                    maxLength={4000}
                    rows={4}
                    value={selected.instructions}
                    disabled={!administrator}
                    onChange={(e) => setSelected({ ...selected, instructions: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.paused}
                    disabled={!administrator}
                    onChange={(e) => setSelected({ ...selected, paused: e.target.checked })}
                  />
                  Pause this agent's collection and worker access
                </label>
                {administrator && <Button disabled={busy}>Save settings</Button>}
              </form>
              {administrator && (
                <section className="space-y-3 border-t pt-5">
                  <h4 className="font-semibold">Worker credential</h4>
                  <p className="text-sm text-muted-foreground">
                    This credential grants access only to this agent's memory and work, plus this
                    organization's shared knowledge. Replacing it immediately invalidates the
                    previous credential.
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy || !selected.selected}
                    onClick={() => void rotateToken()}
                  >
                    Generate / replace credential
                  </Button>
                  {token && (
                    <div className="space-y-2 rounded-md border bg-muted p-4">
                      <p className="text-sm">
                        Save this in the worker's secret settings. It is shown only now.
                      </p>
                      <code className="block break-all text-sm select-all">{token}</code>
                      <Button variant="outline" onClick={() => setToken("")}>
                        Hide credential
                      </Button>
                    </div>
                  )}
                </section>
              )}
              <section className="space-y-4 border-t pt-5">
                <h4 className="font-semibold">Work queue · Latest 50 items</h4>
                {role !== "viewer" && (
                  <form
                    className="flex flex-col gap-3 sm:flex-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void enqueue();
                    }}
                  >
                    <Input
                      aria-label="Work objective"
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      required
                      minLength={10}
                      maxLength={4000}
                      placeholder="Find vendors serving our next community gathering"
                    />
                    <Button disabled={busy || selected.paused || !selected.selected}>
                      Queue work
                    </Button>
                  </form>
                )}
                {!work.length && (
                  <p className="text-sm text-muted-foreground">
                    No work has been queued for this agent.
                  </p>
                )}
                {work.map((task) => (
                  <article key={task.id} className="rounded-md border p-4">
                    <p className="text-xs text-primary">
                      {task.status} · {task.attempts} attempts
                    </p>
                    <p className="mt-2 text-sm">{task.objective}</p>
                    {task.result && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {task.result}
                      </p>
                    )}
                    {task.status === "running" && task.lease_until && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Worker lease expires {new Date(task.lease_until).toLocaleString()}. Expired
                        work is recovered when a worker next checks the queue.
                      </p>
                    )}
                  </article>
                ))}
              </section>
              <section className="space-y-3 border-t pt-5">
                <h4 className="font-semibold">Private agent memory · Latest 50 entries</h4>
                <p className="text-sm text-muted-foreground">
                  Other platform workers cannot retrieve these entries. Your organization's members
                  can review them here.
                </p>
                {!memory.length && (
                  <p className="text-sm text-muted-foreground">
                    The agent has not saved memory yet. Its worker can persist facts, conversation
                    summaries, follow-ups, and checkpoints.
                  </p>
                )}
                {memory.map((entry) => (
                  <article key={entry.id} className="rounded-md border p-4">
                    <p className="text-xs text-primary">
                      {entry.kind.replaceAll("_", " ")} · {entry.memory_key}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{entry.content}</p>
                    {entry.source_url && (
                      <a
                        href={entry.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block break-all text-sm text-primary underline"
                      >
                        Source
                      </a>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Updated {new Date(entry.updated_at).toLocaleString()}
                      {entry.expires_at
                        ? ` · Expires ${new Date(entry.expires_at).toLocaleString()}`
                        : ""}
                    </p>
                  </article>
                ))}
              </section>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
