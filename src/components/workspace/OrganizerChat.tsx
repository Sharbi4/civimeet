import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, CalendarPlus, Monitor, Sprout } from "lucide-react";
import { requestAgentBrowse } from "./BrowserDock";
import { PlanCard } from "./AgentPlans";
import { openAgentPanel, useChatActions, type ChatActionRecord } from "./ChatActions";
import { parseChatIntent } from "@/lib/chat-intents";
import { getConnector } from "@/lib/connectors";
import { missingEventDetails, type EventDraft } from "@/lib/civi";
import { useWorkspace } from "./WorkspaceGate";
import {
  chatLabel,
  chatPrompt,
  isPlatformThread,
  type ChatThread,
  type OrganizerTurn,
} from "@/lib/organizer";
import type { ResearchResult } from "@/lib/research";
import { OrganizerVoice } from "./OrganizerVoice";

export function ResearchAnswer({
  result,
  onBrowse,
}: {
  result: ResearchResult;
  onBrowse?: ((url: string, title: string) => void) | undefined;
}) {
  const sources = result.sources.filter((s) => /^https?:\/\//.test(s.url));
  return (
    <div className="ow-answer">
      <p className="whitespace-pre-wrap">{result.answer}</p>
      {sources.length > 0 && (
        <details>
          <summary>
            {sources.length} {sources.length === 1 ? "source" : "sources"}
          </summary>
          <ul>
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <a href={s.url} target="_blank" rel="noreferrer">
                  [{s.id}] {s.title}
                </a>
                {onBrowse && (
                  <button
                    type="button"
                    onClick={() => onBrowse(s.url, s.title)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#0640d4] hover:bg-[#edf3ff]"
                  >
                    <Monitor size={12} /> Open in agent browser
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Three-dot typing indicator while Civi is replying. */
function Typing() {
  return (
    <span
      className="inline-flex items-center gap-1 py-1"
      role="status"
      aria-label="Civi is replying"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-2 w-2 animate-bounce rounded-full bg-[#94a3b8]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

const fieldLabels: [keyof EventDraft, string][] = [
  ["format", "Type"],
  ["location", "Where"],
  ["date", "When"],
  ["attendance", "People"],
  ["goal", "Purpose"],
  ["budgetUsd", "Budget"],
  ["venue", "Venue"],
];
function showField(draft: EventDraft, key: keyof EventDraft) {
  const value = draft[key];
  if (value === null || value === undefined || value === "") return null;
  if (key === "format") return value === "virtual" ? "Virtual" : "In person";
  if (key === "date")
    return (
      new Date(`${String(value)}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }) + (draft.time ? ` · ${draft.time}` : "")
    );
  if (key === "attendance") return `About ${value}`;
  if (key === "budgetUsd") return `$${Number(value).toLocaleString()}`;
  return String(value);
}
function EventDraftCard({
  draft,
  created,
  busy,
  canCreate,
  onCreate,
  onOpenEvents,
}: {
  draft: EventDraft;
  created: { title: string } | null;
  busy: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onOpenEvents?: (() => void) | undefined;
}) {
  const missing = missingEventDetails(draft);
  return (
    <div className="mt-3 rounded-2xl border border-[#dbe6ff] bg-[#f7faff] p-4">
      <p className="!mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#142d40]">
        <CalendarPlus size={16} className="text-[#0640d4]" />
        {draft.title ?? "Your event"}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        {fieldLabels.map(([key, label]) => {
          const value = showField(draft, key);
          if (!value && (key === "budgetUsd" || key === "venue")) return null;
          return (
            <div key={key} className="contents">
              <dt className="text-[#64717a]">{label}</dt>
              <dd className={value ? "text-[#142d40]" : "italic text-[#94a3b8]"}>
                {value ?? "still to decide"}
              </dd>
            </div>
          );
        })}
      </dl>
      {created ? (
        <p className="!mb-0 mt-3 text-[13px] text-[#0f5132]">
          Created “{created.title}”. Your agents are on it.{" "}
          {onOpenEvents && (
            <button
              type="button"
              onClick={onOpenEvents}
              className="font-medium text-[#0640d4] underline-offset-2 hover:underline"
            >
              Open in Events
            </button>
          )}
        </p>
      ) : missing.length ? (
        <p className="!mb-0 mt-3 text-[12px] text-[#64717a]">
          Still to decide: {missing.join(", ")}.
        </p>
      ) : (
        <button
          type="button"
          disabled={!canCreate || busy}
          onClick={onCreate}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#064cff] px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#0640d4] disabled:opacity-50"
        >
          {busy ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CalendarPlus size={15} />
          )}
          Create event and start the agents
        </button>
      )}
    </div>
  );
}
const actionTone: Record<ChatActionRecord["status"], [string, string]> = {
  started: ["Working on it", "bg-blue-50 text-blue-700"],
  needs_user: ["Waiting for you", "bg-amber-50 text-amber-800"],
  succeeded: ["Done", "bg-emerald-50 text-emerald-700"],
  failed: ["Didn’t work", "bg-red-50 text-red-700"],
};
/** An instruction Civi carried out with a tool, with its real outcome and next step. */
export function ActionTurn({
  action,
  busy,
  onContinue,
  onRetry,
}: {
  action: ChatActionRecord;
  busy: boolean;
  onContinue: (text: string) => void;
  onRetry: () => void;
}) {
  const intent = action.action;
  const platform = "platform" in intent ? intent.platform : undefined;
  const name = platform && platform !== "all" ? (getConnector(platform)?.name ?? platform) : "";
  const [label, tone] = actionTone[action.status];
  const connected =
    intent.type === "connect_platform" &&
    action.status === "succeeded" &&
    /^You're connected/.test(action.reply);
  const link = "rounded-md px-2 py-1 text-[12px] font-medium text-[#0640d4] hover:bg-[#edf3ff]";
  return (
    <article>
      {intent.source !== "civi" && <div className="ow-user-message">{action.message}</div>}
      <div className="ow-agent-message">
        <strong className="flex items-center gap-2">
          Civi
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
            {label}
          </span>
        </strong>
        {action.status === "started" && !action.reply ? (
          <Typing />
        ) : (
          <p className="whitespace-pre-wrap">{action.reply}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {action.status === "needs_user" && intent.type === "connect_platform" && (
            <button type="button" className={link} onClick={() => openAgentPanel("browser")}>
              Show the browser
            </button>
          )}
          {connected && (
            <button
              type="button"
              className={link}
              disabled={busy}
              onClick={() =>
                onContinue(
                  action.resume_goal ||
                    `Look for local communities related to our mission on ${name}.`,
                )
              }
            >
              Yes, go ahead
            </button>
          )}
          {action.status === "failed" && intent.type === "connect_platform" && (
            <button type="button" className={link} disabled={busy} onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function OrganizerChat({
  thread,
  platformName,
  initialMessage = "",
  onDraft,
  eventId,
  onOpenEvents,
}: {
  thread: ChatThread | "discover";
  /** Display name of the connected platform for platform agent threads. */
  platformName?: string | undefined;
  initialMessage?: string;
  onDraft?: (content: string) => void;
  eventId?: string;
  onOpenEvents?: () => void;
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
  // Instructions carried out with tools, shown in the thread next to Civi's replies.
  const actions = useChatActions();
  const [actionRows, setActionRows] = useState<ChatActionRecord[]>([]);
  const actionsVersion = actions?.version ?? 0;
  useEffect(() => {
    if (!actions || thread === "discover") return;
    let active = true;
    void db
      .from("organizer_chat_actions")
      .select("id,thread_key,message,action,status,reply,resume_goal,created_at")
      .eq("organization_id", organizationId)
      .eq("thread_key", thread)
      .order("created_at", { ascending: false })
      .limit(30)
      .then((r: { data: ChatActionRecord[] | null }) => {
        if (active && r.data) setActionRows([...r.data].reverse());
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, organizationId, thread, actionsVersion, Boolean(actions)]);
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
  type SendOptions = {
    presence?: boolean;
    skillId?: string;
    eventId?: string;
    agentId?: string;
  };
  async function send(question = message, options: SendOptions = {}) {
    const text = question.trim();
    if (busy || role === "viewer" || text.length < 2) return;
    // Instructions a tool can carry out run directly; only conversation and research go to Perplexity.
    const intent =
      actions && thread !== "discover" && !options.skillId && !options.presence
        ? parseChatIntent(text)
        : null;
    if (intent && actions) {
      setMessage("");
      setBusy(true);
      setError("");
      try {
        await actions.run(intent, text, thread);
      } finally {
        if (alive.current) setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError("");
    const key = requestKey.current ?? crypto.randomUUID();
    requestKey.current = key;
    // Show the message in the thread right away, with Civi typing underneath.
    setMessage("");
    setTurns((current) => [
      ...current.filter((turn) => turn.id !== `pending-${key}`),
      {
        id: `pending-${key}`,
        input: { question: text, threadKey: thread },
        status: "running",
        result: null,
        error: null,
        created_at: new Date().toISOString(),
      },
    ]);
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
          eventId: options.eventId ?? eventId,
          requestId: key,
          question: text,
          purpose: thread === "venue" ? "venues" : thread === "discover" ? purpose : "general",
          location,
          includeKnowledge: true,
          threadKey: thread,
          ...(options.agentId ? { agentId: options.agentId } : {}),
          skillId:
            options.skillId ??
            (options.presence
              ? "community_presence"
              : thread === "outreach"
                ? "attendance_outreach"
                : thread === "main" || isPlatformThread(thread)
                  ? "auto"
                  : undefined),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Research could not finish.");
      if (!alive.current) return;
      requestKey.current = null;
      await load();
    } catch (e) {
      if (alive.current) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          setTurns((current) => current.filter((turn) => turn.id !== `pending-${key}`));
          setMessage((current) => current || text);
        }
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
  // Creating an event from the conversation hands it to the agents right away.
  const [created, setCreated] = useState<Record<string, { title: string; eventId: string }>>({});
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const saved: Record<string, { title: string; eventId: string }> = {};
    for (const turn of turns) {
      const raw = window.localStorage.getItem(`civimeet.event-from:${turn.id}`);
      if (raw)
        try {
          saved[turn.id] = JSON.parse(raw);
        } catch {
          /* ignore */
        }
    }
    setCreated(saved);
  }, [turns]);
  async function createEvent(turnId: string, draft: EventDraft) {
    if (creating || role === "viewer") return;
    setCreating(true);
    setError("");
    try {
      const title = (draft.title ?? draft.goal ?? "Community gathering").slice(0, 200);
      const purpose = [
        draft.goal,
        draft.audience ? `For ${draft.audience}` : null,
        draft.attendance ? `About ${draft.attendance} people` : null,
        draft.format === "virtual" ? "Virtual event" : "In-person event",
        draft.time ? `Time: ${draft.time}` : null,
      ]
        .filter(Boolean)
        .join(". ");
      const area =
        draft.format === "virtual"
          ? `Online${draft.location ? ` · ${draft.location}` : ""}`
          : (draft.location ?? "");
      const { data, error: failure } = await db.rpc("save_community_event", {
        workspace: organizationId,
        event_data: {
          title: title.length >= 3 ? title : "Community gathering",
          purpose: purpose.length >= 10 ? purpose : `${purpose} · community gathering`,
          event_date: draft.date,
          venue: draft.venue ?? "",
          geographic_area: area.slice(0, 160),
          budget_cents: Math.round((draft.budgetUsd ?? 0) * 100),
        },
      });
      if (failure || !data) throw new Error(failure?.message ?? "The event could not be created.");
      const record = { title, eventId: String(data) };
      window.localStorage.setItem(`civimeet.event-from:${turnId}`, JSON.stringify(record));
      setCreated((current) => ({ ...current, [turnId]: record }));
      setCreating(false);
      requestKey.current = null;
      if (draft.format === "virtual") {
        await send(
          `Our virtual event "${title}" is set for ${draft.date}. Draft the invitations and a simple plan to get the word out.`,
          { skillId: "attendance_outreach", eventId: record.eventId },
        );
      } else {
        const web = await db
          .from("platform_agents")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("platform", "web")
          .eq("selected", true)
          .maybeSingle();
        await send(
          `Find venues, vendors and local partners for "${title}" in ${draft.location} on ${draft.date} for about ${draft.attendance} people${draft.budgetUsd ? ` with a budget of $${draft.budgetUsd}` : ""}.`,
          web.data?.id
            ? { skillId: "local_partner_discovery", eventId: record.eventId, agentId: web.data.id }
            : { skillId: "event_design", eventId: record.eventId },
        );
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The event could not be created.");
    } finally {
      setCreating(false);
    }
  }
  const latestDraftTurn = [...turns].reverse().find((turn) => turn.result?.eventDraft)?.id;
  // When Civi asks for a tool in its reply, run it once (the result is recorded as an action).
  useEffect(() => {
    if (!actions || role === "viewer") return;
    const latest = turns.at(-1);
    const action = latest?.result?.action;
    if (!latest || !action || Date.now() - Date.parse(latest.created_at) > 5 * 60_000) return;
    const key = `civimeet.civi-action:${latest.id}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
    void actions.run(action, latest.input.question, thread, "civi");
  }, [turns, actions, role, thread]);
  const entries = [
    ...turns.map((turn) => ({
      at: turn.created_at,
      turn,
      action: null as ChatActionRecord | null,
    })),
    ...actionRows.map((action) => ({
      at: action.created_at,
      turn: null as OrganizerTurn | null,
      action,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const browse =
    thread === "main" || thread === "discover"
      ? (url: string, title: string) =>
          requestAgentBrowse({ organizationId, url, task: `Look at ${title}`.slice(0, 500) })
      : undefined;
  const running = turns.some(
    (t) => t.status === "running" && Date.now() - Date.parse(t.created_at) < 185000,
  );
  return (
    <div className="ow-chat-thread">
      <header>
        <h2>
          {thread === "discover" ? "Discover your community" : chatLabel(thread, platformName)}
        </h2>
        <p>
          {isPlatformThread(thread)
            ? `Everything your agent does on ${platformName ?? "this platform"}: ideas, drafts and what it learns, in one conversation.`
            : "Research and preparation, grounded in your organization’s knowledge."}
        </p>
      </header>
      {!isPlatformThread(thread) && (
        <OrganizerVoice key={`${organizationId}:${thread}`} thread={thread} />
      )}
      <div className="ow-messages" aria-live="polite">
        {thread === "main" && (
          <section
            className="mb-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4"
            aria-label="Community presence agent"
          >
            <h3 className="flex items-center gap-2 font-semibold">
              <Sprout size={18} /> Your community-building agent
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your saved mission, location, and voice to discover relevant communities and
              prepare genuinely useful posts, tips, and a plan for showing up.
            </p>
            <button
              className="ow-link mt-3"
              disabled={busy || running || role === "viewer"}
              onClick={() => {
                requestKey.current = null;
                void send(
                  "Build our community presence using our saved organization brief. Find relevant local communities and prepare helpful contributions and a practical plan for the next week. Prioritize usefulness over promotion. Cite sources and clearly identify actions that need a connection or approval.",
                  { presence: true },
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

        {!turns.length && (
          <div className="ow-empty">
            <BookOpen size={28} />
            <h3>Start with what your community needs.</h3>
            <p>
              Describe your goal. Your organizer will prepare a sourced next step. Public posts,
              messages, bookings, and payments require review.
            </p>
            {thread !== "discover" && (
              <button onClick={() => setMessage(chatPrompt(thread, platformName))}>
                Use a suggested starting point
              </button>
            )}
          </div>
        )}
        {entries.map(({ turn: t, action }) =>
          action ? (
            <ActionTurn
              key={action.id}
              action={action}
              busy={busy}
              onContinue={(text) => {
                requestKey.current = null;
                void send(text);
              }}
              onRetry={() => actions && void actions.run(action.action, action.message, thread)}
            />
          ) : t ? (
            <article key={t.id}>
              {t.input.eventId && (
                <p className="text-xs text-muted-foreground">Event research · {t.input.location}</p>
              )}
              <div className="ow-user-message">{t.input.question}</div>
              <div className="ow-agent-message">
                <strong>Civi</strong>
                {t.status === "running" ? (
                  <Typing />
                ) : t.result ? (
                  <>
                    <ResearchAnswer result={t.result} onBrowse={browse} />
                    {t.result.plan && "id" in t.result.plan && (
                      <PlanCard planId={t.result.plan.id} />
                    )}
                    {t.result.plan && "error" in t.result.plan && (
                      <p
                        role="alert"
                        className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
                      >
                        {t.result.plan.error}
                      </p>
                    )}
                    {t.result.eventDraft && t.id === latestDraftTurn && (
                      <EventDraftCard
                        draft={t.result.eventDraft}
                        created={created[t.id] ?? null}
                        busy={creating}
                        canCreate={role !== "viewer" && !busy}
                        onCreate={() => void createEvent(t.id, t.result!.eventDraft!)}
                        onOpenEvents={onOpenEvents}
                      />
                    )}
                    {role !== "viewer" && onDraft && t.result.skill?.id !== "conversation" && (
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
          ) : null,
        )}
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
          minLength={2}
          maxLength={3000}
          value={message}
          disabled={role === "viewer"}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
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
          <span>Enter to send · Shift+Enter for a new line</span>
          {busy ? (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              aria-label="Stop waiting"
              title="Stop waiting"
            >
              <span
                className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
            </button>
          ) : (
            <button
              type="submit"
              disabled={message.trim().length < 2 || running || role === "viewer"}
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
