import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useWorkspace } from "./WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResearchResult } from "@/lib/research";

type DiscoveryRun = {
  created_at?: string;
  id: string;
  status: string;
  result: ResearchResult | null;
  error: string | null;
};
export function LocalDiscoveryPanel({ onSaved }: { onSaved?: () => void }) {
  const { db, organizationId, role } = useWorkspace();
  const [area, setArea] = useState("");
  const [goal, setGoal] = useState("");
  const [agentId, setAgentId] = useState("");
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running =
    run?.status === "running" && (!run.created_at || now - Date.parse(run.created_at) < 185000);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const request = useRef({ fingerprint: "", id: "" });
  const scope = useRef(organizationId);
  scope.current = organizationId;
  useEffect(() => {
    let active = true;
    setReady(false);
    setBusy(false);
    setRun(null);
    setError("");
    setArea("");
    setGoal("");
    setAgentId("");
    request.current = { fingerprint: "", id: "" };
    Promise.all([
      db
        .from("organization_briefs")
        .select("area,event_goal")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db
        .from("platform_agents")
        .select("id,paused,selected")
        .eq("organization_id", organizationId)
        .eq("platform", "web")
        .maybeSingle(),
      db
        .from("steward_research_runs")
        .select("id,status,result,error,created_at")
        .eq("organization_id", organizationId)
        .eq("input->>collectVendors", "true")
        .order("created_at", { ascending: false })
        .limit(1),
    ]).then(([brief, agent, history]) => {
      if (!active) return;
      if (brief.error || agent.error || history.error) {
        setError("Could not load local discovery. Refresh to retry.");
        return;
      }
      setArea(brief.data?.area ?? "");
      setGoal(brief.data?.event_goal ?? "");
      if (agent.data?.selected && !agent.data.paused) setAgentId(agent.data.id);
      setRun(history.data?.[0] ?? null);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [db, organizationId]);
  useEffect(() => {
    if (run?.status !== "running") return;
    let active = true;
    const timer = setInterval(() => {
      setNow(Date.now());
      db.from("steward_research_runs")
        .select("id,status,result,error,created_at")
        .eq("organization_id", organizationId)
        .eq("id", run.id)
        .single()
        .then(({ data, error: failure }) => {
          if (!active || failure) return;
          setRun(data);
          if (data.status === "completed") onSaved?.();
        });
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [db, organizationId, run?.id, run?.status, onSaved]);
  async function discover() {
    if (busy || !agentId || !area.trim()) return;
    if (run?.status === "running" && !running) request.current = { fingerprint: "", id: "" };
    const org = organizationId;
    const fingerprint = JSON.stringify({ org, area, goal, agentId });
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Sign in again to continue.");
      const response = await fetch("/api/steward/research", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          organizationId: org,
          agentId,
          requestId: request.current.id,
          collectVendors: true,
          skillId: "local_partner_discovery",
          includeKnowledge: true,
          purpose: "vendors",
          location: area,
          question: `Discover local vendors and partners that serve our community and prepare a useful gathering proposal. Goal: ${goal || "Use our organization mission and open community needs"}. Save only sourced public business details. Prepare outreach and attendance-building steps as drafts for review.`,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Discovery could not finish.");
      if (scope.current !== org) return;
      setRun(body.run);
      if (body.run.status === "completed") {
        request.current = { fingerprint: "", id: "" };
        onSaved?.();
      }
      if (body.run.status === "failed") request.current = { fingerprint: "", id: "" };
    } catch (failure) {
      if (scope.current === org)
        setError(failure instanceof Error ? failure.message : "Could not reach your Steward.");
    } finally {
      if (scope.current === org) setBusy(false);
    }
  }
  return (
    <section
      className="rounded-xl border bg-card p-5 space-y-4"
      aria-label="Local partner discovery"
    >
      <div>
        <h3 className="text-lg font-semibold">Your next local connection</h3>
        <p className="text-sm text-muted-foreground">
          Your Steward researches local businesses, saves sourced candidates, and drafts a gathering
          proposal with next steps.
        </p>
      </div>
      {role !== "viewer" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void discover();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm space-y-1">
              <span>Community area</span>
              <Input
                required
                maxLength={160}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="City, neighborhood, and state"
              />
            </label>
            <label className="text-sm space-y-1">
              <span>What are you bringing people together for?</span>
              <Input
                maxLength={1000}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Uses your community brief when left blank"
              />
            </label>
          </div>
          <Button disabled={!ready || !agentId || busy || running}>
            {busy || running ? "Finding local partners…" : "Find local partners & prepare a plan"}
          </Button>
          {ready && !agentId && (
            <p className="text-sm">
              Select and unpause your public web agent in{" "}
              <Link to="/platform-agents" className="underline">
                Platform Agents
              </Link>
              .
            </p>
          )}
        </form>
      )}
      {(error || run?.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || run?.error}
        </p>
      )}
      {run?.result && (
        <div className="space-y-3" role="status">
          <p className="text-sm font-medium">
            {run.result.savedDiscovery?.vendorCount ?? 0} sourced vendor candidates saved for
            review.
            {!!run.result.savedDiscovery?.skippedCount &&
              ` ${run.result.savedDiscovery.skippedCount} candidates could not be saved; review the research before retrying.`}
          </p>
          <div className="flex gap-4 text-sm">
            <Link to="/vendors" className="text-primary underline">
              Review vendors
            </Link>
            {run.result.savedDiscovery?.planId && (
              <Link to="/planning" className="text-primary underline">
                Review gathering proposal
              </Link>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-sm">Research and sources</summary>
            <p className="mt-3 text-sm whitespace-pre-wrap">{run.result.answer}</p>
            {run.result.sources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-primary underline"
              >
                [{source.id}] {source.title}
              </a>
            ))}
          </details>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        One research run completes the discovery and draft automatically. Public information only;
        contacts and availability need review. Nothing is sent, booked, or charged.
      </p>
    </section>
  );
}
