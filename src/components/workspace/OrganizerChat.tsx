import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, Sprout } from "lucide-react";
import { useWorkspace } from "./WorkspaceGate";
import {
  threadLabels,
  threadPrompts,
  type OrganizerThread,
  type OrganizerTurn,
} from "@/lib/organizer";
import type { ResearchResult } from "@/lib/research";
import { OrganizerVoice } from "./OrganizerVoice";

export function ResearchAnswer({ result }: { result: ResearchResult }) {
  return (
    <div className="ow-answer">
      <p className="whitespace-pre-wrap">{result.answer}</p>
      {result.sources.length > 0 && (
        <details>
          <summary>{result.sources.length} research sources</summary>
          <ul>
            {result.sources
              .filter((s) => /^https?:\/\//.test(s.url))
              .map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    [{s.id}] {s.title}
                  </a>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
export function OrganizerChat({
  thread,
  initialMessage = "",
  onDraft,
  eventId,
}: {
  thread: OrganizerThread | "discover";
  initialMessage?: string;
  onDraft?: (content: string) => void;
  eventId?: string;
}) {
  const { db, organizationId, role } = useWorkspace();
  const [turns, setTurns] = useState<OrganizerTurn[]>([]);
  const [message, setMessage] = useState(initialMessage);
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("resources");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestKey = useRef<string | null>(null);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const load = useCallback(async () => {
    let query = db
      .from("steward_research_runs")
      .select("id,input,status,result,error,created_at")
      .eq("organization_id", organizationId)
      .eq("input->>threadKey", thread);
    if (eventId) query = query.eq("input->>eventId", eventId);
    const r = await query.order("created_at", { ascending: false }).limit(25);
    if (!alive.current) return;
    if (r.error) setError("Conversation could not be loaded. Try again.");
    else setTurns(((r.data ?? []) as OrganizerTurn[]).reverse());
  }, [db, organizationId, thread, eventId]);
  useEffect(() => {
    void load();
    let active = true;
    void db
      .from("organization_briefs")
      .select("area")
      .eq("organization_id", organizationId)
      .maybeSingle()
      .then((r) => {
        if (active) setLocation(r.data?.area ?? "");
      });
    return () => {
      active = false;
    };
  }, [load, db, organizationId]);
  useEffect(() => {
    if (!turns.some((t) => t.status === "running")) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [turns, load]);
  async function send(question = message, presence = false) {
    if (busy || role === "viewer") return;
    setBusy(true);
    setError("");
    const key = requestKey.current ?? crypto.randomUUID();
    requestKey.current = key;
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 120000);
    try {
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Sign in again to continue.");
      const response = await fetch("/api/research", {
        method: "POST",
        signal: controller.current.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          organizationId,
          eventId,
          requestId: key,
          question,
          purpose: thread === "venue" ? "venues" : thread === "discover" ? purpose : "general",
          location,
          includeKnowledge: true,
          threadKey: thread,
          skillId: presence
            ? "community_presence"
            : thread === "outreach"
              ? "attendance_outreach"
              : thread === "main"
                ? "auto"
                : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Research could not finish.");
      if (!alive.current) return;
      requestKey.current = null;
      setMessage("");
      await load();
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof Error && e.name === "AbortError"
            ? "Stopped waiting. Research may finish in the background; check this conversation before retrying."
            : e instanceof Error
              ? e.message
              : "Research could not finish.",
        );
        await load();
      }
    } finally {
      clearTimeout(timeout);
      if (alive.current) setBusy(false);
    }
  }
  const running = turns.some(
    (t) => t.status === "running" && Date.now() - Date.parse(t.created_at) < 185000,
  );
  return (
    <div className="ow-chat-thread">
      <header>
        <h2>{thread === "discover" ? "Discover your community" : threadLabels[thread]}</h2>
        <p>Research and preparation, grounded in your organization’s knowledge.</p>
      </header>
      <OrganizerVoice key={`${organizationId}:${thread}`} thread={thread} />
      {thread === "main" && (
        <section
          className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"
          aria-label="Community presence agent"
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <Sprout size={18} /> Your community-building agent
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your saved mission, location, and voice to discover relevant communities and prepare
            genuinely useful posts, tips, and a plan for showing up.
          </p>
          <button
            className="ow-link mt-3"
            disabled={busy || running || role === "viewer"}
            onClick={() => {
              requestKey.current = null;
              void send(
                "Build our community presence using our saved organization brief. Find relevant local communities and prepare helpful contributions and a practical plan for the next week. Prioritize usefulness over promotion. Cite sources and clearly identify actions that need a connection or approval.",
                true,
              );
            }}
          >
            Build our community presence
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Set your community brief in Identity first. This runs research and creates drafts; it
            does not join groups or publish.
          </p>
        </section>
      )}
      {thread === "discover" && (
        <div className="ow-research-options">
          <label>
            Local area
            <input
              value={location}
              maxLength={160}
              onChange={(e) => {
                setLocation(e.target.value);
                requestKey.current = null;
              }}
              placeholder="City or service area"
            />
          </label>
          <label>
            Research
            <select
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                requestKey.current = null;
              }}
            >
              <option value="resources">Organizations & resources</option>
              <option value="venues">Venues</option>
              <option value="vendors">Vendors</option>
              <option value="events">Events</option>
            </select>
          </label>
        </div>
      )}
      <div className="ow-messages" aria-live="polite">
        {!turns.length && (
          <div className="ow-empty">
            <BookOpen size={28} />
            <h3>Start with what your community needs.</h3>
            <p>
              Describe your goal. Your organizer will prepare a sourced next step. Public posts,
              messages, bookings, and payments require review.
            </p>
            {thread !== "discover" && (
              <button onClick={() => setMessage(threadPrompts[thread])}>
                Use a suggested starting point
              </button>
            )}
          </div>
        )}
        {turns.map((t) => (
          <article key={t.id}>
            {t.input.eventId && <p className="text-xs text-muted-foreground">Event research · {t.input.location}</p>}
            <div className="ow-user-message">{t.input.question}</div>
            <div className="ow-agent-message">
              <strong>Civi · AI organizer</strong>
              {t.status === "running" ? (
                <p>Researching and checking sources…</p>
              ) : t.result ? (
                <>
                  <ResearchAnswer result={t.result} />
                  {role !== "viewer" && onDraft && (
                    <button
                      className="ow-link"
                      onClick={() => {
                        if (t.result) onDraft(t.result.answer);
                      }}
                    >
                      Prepare a draft for review
                    </button>
                  )}
                </>
              ) : (
                <p role="alert">{t.error ?? "Research did not complete."}</p>
              )}
            </div>
          </article>
        ))}
      </div>
      {error && (
        <p role="alert" className="ow-error">
          {error}
        </p>
      )}
      <form
        className="ow-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="organizer-message">
          Message your organizer
        </label>
        <textarea
          id="organizer-message"
          required
          minLength={10}
          maxLength={3000}
          value={message}
          disabled={busy || role === "viewer"}
          onChange={(e) => {
            setMessage(e.target.value);
            requestKey.current = null;
          }}
          placeholder={
            role === "viewer"
              ? "An editor can assign work to the organizer."
              : "What would you like to bring to your community?"
          }
        />
        <div>
          <span>Sources saved to your organization · no automatic publishing</span>
          {busy ? (
            <button type="button" onClick={() => controller.current?.abort()}>
              Stop waiting
            </button>
          ) : (
            <button
              type="submit"
              disabled={message.trim().length < 10 || running || role === "viewer"}
              aria-label="Send to organizer"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
