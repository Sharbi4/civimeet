import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "./WorkspaceGate";
import { PlatformBrowser } from "./BrowserDock";
import { platformLabels, type PlatformAgent } from "@/lib/vendors";
import type { ResearchResult } from "@/lib/research";

type Turn = {
  id: string;
  input: { question: string };
  status: string;
  result: ResearchResult | null;
  error: string | null;
};
export function PlatformConversation({ agent }: { agent: PlatformAgent }) {
  const { db, organizationId, role } = useWorkspace();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const result = await db
      .from("steward_research_runs")
      .select("id,input,status,result,error")
      .eq("organization_id", organizationId)
      .eq("input->>agentId", agent.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!alive.current) return;
    if (result.error) setError("This platform's conversation could not be loaded.");
    else setTurns(((result.data ?? []) as Turn[]).reverse());
  }, [db, organizationId, agent.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!turns.some((turn) => turn.status === "running")) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [turns, load]);
  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    const key = requestId ?? crypto.randomUUID();
    setRequestId(key);
    try {
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Sign in again to continue.");
      const response = await fetch("/api/steward/research", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          agentId: agent.id,
          requestId: key,
          question: message,
          purpose: "general",
          location: "",
          includeKnowledge: false,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Your agent could not complete this turn.");
      if (!alive.current) return;
      setMessage("");
      setRequestId(null);
      await load();
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Could not reach your agent.");
        await load();
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const canSend = role !== "viewer" && agent.selected && !agent.paused;
  return (
    <div className="space-y-4">
      <PlatformBrowser agentId={agent.id} />
      <section
        className="space-y-4 rounded-xl border bg-card p-5"
        aria-label={`${platformLabels[agent.platform]} conversation`}
      >
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h4 className="font-semibold">Your {platformLabels[agent.platform]} agent</h4>
            <p className="text-xs text-muted-foreground">
              A separate conversation for this organization and platform.
            </p>
          </div>
        </div>
        {agent.platform === "facebook" && (
          <p className="text-sm text-muted-foreground">
            Prepare Page posts, comment responses, and event updates here. Group participation,
            messages, and channel creation need their own supported connection and permissions; this
            chat does not perform them.
          </p>
        )}
        <div aria-live="polite" className="max-h-[32rem] space-y-4 overflow-y-auto">
          {!turns.length && (
            <p className="text-sm">
              Your community brief supplies the mission and this channel's responsibilities. Ask for
              a next contribution or jump in with a specific direction.
            </p>
          )}
          {turns.map((turn) => (
            <article key={turn.id} className="space-y-3 border-b pb-4">
              <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">
                <strong>You</strong>
                <br />
                {turn.input.question}
              </p>
              <div className="text-sm">
                <strong>{agent.name}</strong>
                <p className="mt-2 whitespace-pre-wrap">
                  {turn.status === "running"
                    ? "Researching a useful next step…"
                    : (turn.result?.answer ?? turn.error ?? "This turn did not complete.")}
                </p>
                {turn.result?.sources.map(
                  (source) =>
                    /^https?:\/\//.test(source.url) && (
                      <a
                        key={source.id}
                        className="mt-1 block text-xs text-primary underline"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        [{source.id}] {source.title}
                      </a>
                    ),
                )}
              </div>
            </article>
          ))}
        </div>
        {canSend && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {!message && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setMessage(
                    `Using our community brief and your ${platformLabels[agent.platform]} responsibilities, propose the next useful contribution. Explain why it helps, draft any suggested content, and identify what requires our decision. Do not claim to have posted, messaged, or booked anything.`,
                  )
                }
              >
                Prepare my next contribution
              </Button>
            )}
            <label className="block text-sm space-y-2">
              <span>Guide your agent</span>
              <Textarea
                required
                minLength={10}
                maxLength={3000}
                value={message}
                disabled={busy}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setRequestId(null);
                }}
                placeholder="What would you like to adjust or explore?"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Uses Perplexity and the organization's daily research allowance. Your brief and recent
              conversation provide context. Responses are drafts; nothing is published or sent. Keep
              credentials and private member details out of chat.
            </p>
            <Button disabled={busy || turns.some((turn) => turn.status === "running")}>
              {busy ? "Working on your next step…" : "Send to agent"}
            </Button>
          </form>
        )}
        {!canSend && (
          <p className="text-sm text-muted-foreground">
            {role === "viewer"
              ? "You can read this conversation."
              : "Select and unpause this platform to start its planning conversation."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
