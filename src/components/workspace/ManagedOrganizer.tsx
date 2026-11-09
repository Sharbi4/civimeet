import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Sparkles, MoreHorizontal } from "lucide-react";
import { useWorkspace } from "./WorkspaceGate";
import type { OrganizerThread } from "@/lib/organizer";
import { parseChatIntent } from "@/lib/chat-intents";
import { useChatActions, type ChatActionRecord } from "./ChatActions";
import { ActionTurn } from "./OrganizerChat";

type Message = { id: string; role: string; text: string };
type State = {
  status: string;
  configuration?: { ready: boolean };
  messages: Message[];
  needsResume?: boolean;
  hasOlderMessages?: boolean;
  usage?: { total_tokens: number };
  spend?: { consumed: number; limit: number };
};
export function ManagedOrganizer({
  thread,
  initialMessage = "",
  onDraft,
}: {
  thread: OrganizerThread;
  initialMessage?: string;
  onDraft?: (text: string) => void;
}) {
  const { db, organizationId, role } = useWorkspace();
  const actions = useChatActions();
  const [actionRows, setActionRows] = useState<ChatActionRecord[]>([]);
  useEffect(() => {
    let active = true;
    void db
      .from("organizer_chat_actions")
      .select("id,thread_key,message,action,status,reply,resume_goal,created_at")
      .eq("organization_id", organizationId)
      .eq("thread_key", thread)
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r) => {
        if (active && r.data) setActionRows((r.data as ChatActionRecord[]).reverse());
      });
    return () => {
      active = false;
    };
  }, [db, organizationId, thread, actions?.version]);
  const [state, setState] = useState<State>({ status: "loading", messages: [] });
  const [message, setMessage] = useState(initialMessage),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [activity, setActivity] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  const alive = useRef(true),
    connection = useRef<AbortController | null>(null);
  const submission = useRef<{ text: string; id: string } | null>(null);
  const call = useCallback(
    async (action: string, extra: Record<string, unknown> = {}, signal?: AbortSignal) => {
      const auth = await db.auth.getSession();
      if (!auth.data.session) throw new Error("Sign in again to use your organizer.");
      const response = await fetch("/api/organizer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.data.session.access_token}`,
        },
        body: JSON.stringify({ organizationId, thread, action, ...extra }),
        signal: signal ?? null,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "The organizer could not complete that request.");
      }
      return response;
    },
    [db, organizationId, thread],
  );
  const refresh = useCallback(async () => {
    try {
      const next = await (await call("status")).json();
      if (alive.current) setState(next);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Could not load saved work.");
    }
  }, [call]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      connection.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (busy || !["in_progress", "cancellation_requested"].includes(state.status)) return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [busy, state.status, refresh]);
  async function run(action: "send" | "resume") {
    if (busy || role === "viewer" || (action === "send" && !message.trim())) return;
    const intent = action === "send" ? parseChatIntent(message.trim()) : null;
    if (intent && actions) {
      setBusy(true);
      setError("");
      try {
        await actions.run(intent, message.trim(), thread);
        setMessage("");
      } catch {
        setError("The workspace action could not complete. Check its saved status.");
      } finally {
        if (alive.current) setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError("");
    setParts({});
    setActivity("Connecting to your organizer…");
    const text = message.trim();
    if (action === "send" && submission.current?.text !== text)
      submission.current = { text, id: crypto.randomUUID() };
    const abort = new AbortController();
    connection.current = abort;
    try {
      const response = await call(
        action,
        action === "send" ? { message: text, requestId: submission.current!.id } : {},
        abort.signal,
      );
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No live response. Refresh saved work.");
      if (action === "send") {
        setMessage("");
        setState((s) => ({
          ...s,
          messages: [...s.messages, { id: "pending", role: "user", text }],
        }));
      }
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const event = JSON.parse(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            if (!alive.current) continue;
            if (event.type === "delta" || event.type === "text")
              setParts((p) => ({
                ...p,
                [event.id]: event.type === "text" ? event.text : (p[event.id] || "") + event.text,
              }));
            if (event.message) setActivity(event.message);
            if (event.type === "outcome" || event.type === "saved") {
              submission.current = null;
              setActivity(
                event.status === "completed"
                  ? "Saved to this conversation."
                  : event.status === "cancelled"
                    ? "Task stopped."
                    : event.message || "Task ended. Review its saved response.",
              );
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      await refresh();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Connection interrupted. Refresh saved work.");
    } finally {
      if (alive.current) setBusy(false);
      connection.current = null;
    }
  }
  async function stop() {
    setError("");
    try {
      await call("cancel");
      setActivity("Stop requested. Waiting for confirmation…");
      setState((s) => ({ ...s, status: "cancellation_requested" }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop the task.");
    }
  }
  async function newConversation() {
    try {
      await call("new");
      setParts({});
      setActivity("");
      submission.current = null;
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a conversation.");
    }
  }
  const ready = state.configuration?.ready,
    active =
      busy || ["in_progress", "requires_action", "cancellation_requested"].includes(state.status);
  return (
    <section className="civi-chat" aria-label="AI community organizer">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <strong className="flex items-center gap-2">
            <Sparkles size={18} /> Civi
          </strong>
          <p className="mt-1 text-sm text-slate-500">Your AI community organizer</p>
        </div>
        <div className="flex gap-2">
          <details className="civi-chat-menu">
            <summary aria-label="Conversation options">
              <MoreHorizontal size={20} />
            </summary>
            <div>
              <button onClick={() => void refresh()} disabled={busy}>
                Refresh saved work
              </button>
              <button onClick={() => void newConversation()} disabled={active}>
                New conversation
              </button>
              {state.usage && (
                <small>{state.usage.total_tokens.toLocaleString()} tokens used</small>
              )}
            </div>
          </details>
          {active && (
            <button type="button" className="ow-button" onClick={() => void stop()}>
              <Square size={14} /> Stop task
            </button>
          )}
        </div>
      </header>
      {!ready && state.status !== "loading" && (
        <div className="m-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <strong>OpenAI organizer setup is pending</strong>
          <p className="mt-1 text-sm">
            Your organization information and existing research tools are available. The
            conversational organizer needs its OpenAI server credentials before it can respond.
          </p>
        </div>
      )}
      <div className="civi-chat-scroll" aria-live="polite">
        {ready && !state.messages.length && !busy && (
          <div className="civi-chat-welcome">
            <span>
              <Sparkles size={26} />
            </span>
            <h2>What shall we bring to life?</h2>
            <p>
              Tell me what you have in mind. We’ll work from your community’s mission and take it
              from there.
            </p>
            <div>
              <button onClick={() => setMessage("Help us plan our next community event.")}>
                Plan a gathering
              </button>
              <button onClick={() => setMessage("Find local partners who fit our mission.")}>
                Find local partners
              </button>
            </div>
          </div>
        )}
        {state.hasOlderMessages && (
          <p className="text-xs text-slate-500">Showing the most recent saved messages.</p>
        )}
        {actionRows.length > 0 && (
          <details className="civi-chat-history">
            <summary>Workspace activity</summary>
            {actionRows.map((action) => (
              <ActionTurn
                key={action.id}
                action={action}
                busy={busy || Boolean(actions?.busy)}
                onContinue={(text) => setMessage(text)}
                onRetry={() => {
                  void actions?.run(action.action, action.message, thread);
                }}
              />
            ))}
          </details>
        )}
        {state.messages.map((m) => (
          <article
            key={m.id}
            className={`civi-message ${m.role === "user" ? "civi-message-user" : "civi-message-agent"}`}
          >
            <small className="font-semibold text-blue-700">
              {m.role === "user" ? "Your team" : "Civi · AI organizer"}
            </small>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.text}</p>
            {m.role === "assistant" && onDraft && (
              <button className="ow-button mt-3" onClick={() => onDraft(m.text)}>
                Prepare for review
              </button>
            )}
          </article>
        ))}
        {busy && Object.values(parts).length > 0 && (
          <article className="rounded-xl border p-4">
            <small>Civi · AI organizer</small>
            <p className="whitespace-pre-wrap text-sm leading-6">
              {Object.values(parts).join("\n\n")}
            </p>
          </article>
        )}
        {activity && (
          <p className="text-sm text-blue-700" role="status">
            {activity}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
      </div>
      {ready && (
        <div className="civi-composer">
          {state.needsResume && !busy && (
            <button className="ow-button mb-3" onClick={() => void run("resume")}>
              Continue saved task
            </button>
          )}
          {state.status === "in_progress" && !busy && (
            <button className="ow-button mb-3" onClick={() => void run("resume")}>
              Reconnect to live task
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("send");
            }}
            className="flex gap-2"
          >
            <textarea
              aria-label="Message your community organizer"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={6000}
              rows={2}
              className="min-w-0 flex-1 rounded-xl border p-3"
              placeholder="Message Civi…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!active) void run("send");
                }
              }}
              disabled={role === "viewer"}
            />
            <button
              aria-label="Send to organizer"
              className="ow-button ow-button-primary self-end"
              disabled={active || !message.trim() || role === "viewer"}
            >
              <ArrowUp size={18} />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Your community. Your voice. Your final say.
          </p>
        </div>
      )}
    </section>
  );
}
