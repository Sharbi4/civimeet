import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Square, MoreHorizontal, Copy, FileCheck2, Globe } from "lucide-react";
import { useWorkspace } from "./WorkspaceGate";
import type { ChatThread } from "@/lib/organizer";

type Message = { id: string; role: string; text: string };
type State = {
  status: string;
  configuration?: { ready: boolean };
  messages: Message[];
  needsResume?: boolean;
  hasOlderMessages?: boolean;
  usage?: { total_tokens: number };
  spend?: { consumed: number; limit: number };
  browser?: {
    available: boolean;
    title: string | null;
    screenshot: string | null;
    note?: string | null;
    live?: { url: string; humanControl: boolean } | null;
  };
};
export function ManagedOrganizer({
  thread,
  initialMessage = "",
  onDraft,
  report,
}: {
  thread: ChatThread | "discover";
  initialMessage?: string;
  onDraft?: (text: string) => void;
  /** Civi's roll-up of every helper, shown at the top of the main conversation. */
  report?: ReactNode;
}) {
  const { db, organizationId, role } = useWorkspace();
  const [state, setState] = useState<State>({ status: "loading", messages: [] });
  const [message, setMessage] = useState(initialMessage),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [activity, setActivity] = useState("");
  const [parts, setParts] = useState<Record<string, string>>({});
  // What Civi's browser is showing right now (screenshots stream in; nothing is stored).
  const [browser, setBrowser] = useState<{ title: string; screenshot?: string } | null>(null);
  const [browserOpen, setBrowserOpen] = useState(true);
  // The live browser (Browserbase) the team can watch and take over; null when none is open.
  const [live, setLive] = useState<{ url: string; humanControl: boolean } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const alive = useRef(true),
    connection = useRef<AbortController | null>(null);
  // Automatic reconnects in a row, so a task that keeps dropping doesn't loop forever.
  const reconnects = useRef(0);
  const lastReason = useRef("");
  const resumedOnOpen = useRef(false);
  // What the current request is doing, and a message waiting to take over from a reconnect.
  const mode = useRef<"send" | "resume" | null>(null);
  const queuedSend = useRef(false);
  const [sending, setSending] = useState(false);
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
        // Proxies can answer with an HTML error page, so never assume a JSON body.
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
          restart?: unknown;
        } | null;
        const fallback =
          response.status >= 500
            ? "Civi couldn't be reached just now. Try again in a moment."
            : "The organizer could not complete that request.";
        throw Object.assign(
          new Error(typeof body?.error === "string" && body.error ? body.error : fallback),
          { restart: body?.restart === true, status: response.status },
        );
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
  async function run(action: "send" | "resume", attempt = 0, carried?: string) {
    const text = (carried ?? message).trim();
    if (role === "viewer" || (action === "send" && !text)) return;
    if (mode.current) {
      // A new message always gets through: stop listening to the old task, then send.
      if (action === "send" && mode.current === "resume") {
        queuedSend.current = true;
        connection.current?.abort();
      }
      return;
    }
    mode.current = action;
    setSending(action === "send");
    setBusy(true);
    setError("");
    setParts({});
    if (action === "send") {
      reconnects.current = 0;
      setBrowser(null);
    }
    setActivity(action === "resume" ? "Reconnecting to Civi…" : "Sending to Civi…");
    let reconnect = false;
    let planned = false;
    // Whether the server said how this connection ended; a silent end means it was cut.
    let ended = false;
    let failedMessage = "";
    let restart = false;
    let retrySend = false;
    if (action === "send" && attempt === 0) {
      // Show the message in the thread the moment it's sent, like any chat.
      setMessage("");
      setState((s) => ({
        ...s,
        messages: [
          ...s.messages.filter((m) => m.id !== "pending"),
          { id: "pending", role: "user", text },
        ],
      }));
    }
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
            if (event.type === "ping") continue;
            if (
              ["outcome", "saved", "continue", "interrupted", "failed", "blocked"].includes(
                event.type,
              )
            )
              ended = true;
            if (event.type === "delta" || event.type === "text")
              setParts((p) => ({
                ...p,
                [event.id]: event.type === "text" ? event.text : (p[event.id] || "") + event.text,
              }));
            if (event.type === "browser_live" && typeof event.url === "string")
              setLive({ url: event.url, humanControl: Boolean(event.humanControl) });
            if (event.type === "browser")
              setBrowser((current) => ({
                title: typeof event.title === "string" ? event.title : "Using the browser",
                ...(typeof event.screenshot === "string"
                  ? { screenshot: event.screenshot }
                  : current?.screenshot
                    ? { screenshot: current.screenshot }
                    : {}),
              }));
            if (event.type === "continue") {
              // A planned hand-off between connections: reconnect right away, not a failure.
              reconnect = true;
              planned = true;
            }
            if (event.type === "interrupted") reconnect = true;
            if (event.type === "interrupted" && typeof event.reason === "string")
              lastReason.current = event.reason;
            if (event.type === "failed") {
              // A real failure: say why and stop; the next message starts fresh.
              reconnect = false;
              failedMessage = typeof event.message === "string" ? event.message : "";
            }
            if (event.message) setActivity(event.message);
            if (event.type === "outcome" || event.type === "saved") {
              submission.current = null;
              reconnects.current = 0;
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
      if (!ended && !queuedSend.current) {
        // The connection was cut without a word: pick the task back up.
        reconnect = true;
        lastReason.current = "the connection was cut";
      }
      await refresh();
    } catch (e) {
      const failure = e as Error & { restart?: boolean };
      const failureText = failure instanceof Error ? failure.message : "Connection interrupted.";
      if (queuedSend.current) {
        // We stopped this reconnect ourselves so a new message can go through.
      } else if (action === "send" && failure.restart && attempt < 1) {
        // The old task was stuck and has been set aside: send into a fresh conversation.
        restart = true;
        setActivity("Starting a fresh conversation…");
      } else if (/still finishing|already responding/i.test(failureText)) {
        // Civi may still be finishing the last reply: wait a moment and try again.
        if (action === "send" && attempt < 6) retrySend = true;
        else reconnect = true;
      } else if (alive.current) {
        setActivity("");
        setError(failureText);
        if (action === "send") {
          setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== "pending") }));
          setMessage((current) => current || text);
        }
      }
    } finally {
      if (alive.current) setBusy(false);
      connection.current = null;
      mode.current = null;
      setSending(false);
    }
    if (failedMessage && alive.current) {
      setActivity("");
      setError(failedMessage);
    }
    if (queuedSend.current) {
      queuedSend.current = false;
      reconnects.current = 0;
      setTimeout(() => void runRef.current("send"), 0);
      return;
    }
    if (restart || retrySend) {
      if (restart) submission.current = null;
      setTimeout(() => void runRef.current("send", attempt + 1, text), restart ? 0 : 1500);
      return;
    }
    if (reconnect && alive.current && planned) {
      setTimeout(() => {
        if (alive.current) void runRef.current("resume");
      }, 300);
    } else if (reconnect && alive.current && reconnects.current < 8) {
      // Civi may still be holding the last connection for a few seconds: back off and retry.
      reconnects.current += 1;
      setTimeout(
        () => {
          if (alive.current) void runRef.current("resume");
        },
        Math.min(8000, 1500 * reconnects.current),
      );
    } else if (reconnect && alive.current) {
      setActivity("");
      setError(
        `Civi couldn't stay connected to that task${lastReason.current ? ` (${lastReason.current})` : ""}. Just send your message again: Civi will pick up or start fresh.`,
      );
    }
  }
  useEffect(() => {
    if (state.browser && "live" in state.browser) setLive(state.browser.live ?? null);
  }, [state.browser]);
  useEffect(() => {
    const ended = (event: MessageEvent) => {
      if (event.data === "browserbase-disconnected") {
        setLive(null);
        void refresh();
      }
    };
    window.addEventListener("message", ended);
    return () => window.removeEventListener("message", ended);
  }, [refresh]);
  async function liveControl(action: "browser_takeover" | "browser_handback" | "browser_close") {
    setLiveBusy(true);
    setError("");
    try {
      const result = (await (await call(action)).json()) as { status?: string };
      if (action === "browser_close" || result.status === "no_browser") setLive(null);
      else setLive((current) => current && { ...current, humanControl: result.status === "human" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Civi's browser couldn't be updated.");
    } finally {
      setLiveBusy(false);
    }
  }
  const runRef = useRef(run);
  runRef.current = run;
  // Opening a conversation picks up a task that is still running or waiting on Civi's tools.
  useEffect(() => {
    if (resumedOnOpen.current || busy || role === "viewer") return;
    if (state.status === "in_progress" || state.needsResume) {
      resumedOnOpen.current = true;
      void runRef.current("resume");
    } else if (state.status !== "loading") resumedOnOpen.current = true;
  }, [state.status, state.needsResume, busy, role]);
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
  const active =
    busy || ["in_progress", "requires_action", "cancellation_requested"].includes(state.status);
  useEffect(() => {
    const reset = () => {
      if (!active) void newConversation();
    };
    window.addEventListener("civimeet:new-chat", reset);
    return () => window.removeEventListener("civimeet:new-chat", reset);
  });
  const empty = !state.messages.length && !busy;
  const suggestions: [string, string, string][] = [
    [
      "How are my helpers doing?",
      "A check-in on every connected account",
      "Give me today's report on all my helpers: what each one did, what needs me, and our spending.",
    ],
    [
      "Plan a gathering",
      "Format, place, date and budget",
      "Help us plan our next community event.",
    ],
    [
      "Find local partners",
      "Vendors, venues and nonprofits nearby",
      "Find local partners who fit our mission.",
    ],
    [
      "Pay a vendor",
      "Within this month's budget",
      "Request a $250 deposit for the Reid Park pavilion.",
    ],
  ];
  return (
    <section className="civi-chat cv-chat" aria-label="AI community organizer">
      {(active || state.messages.length > 0) && (
        <div className="absolute right-4 top-2 z-10 flex gap-2">
          {active && (
            <button type="button" className="cv-chip" onClick={() => void stop()}>
              <Square size={13} /> Stop
            </button>
          )}
          <details className="civi-chat-menu">
            <summary aria-label="Conversation options" className="cv-icon-btn">
              <MoreHorizontal size={18} />
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
        </div>
      )}
      {state.status !== "configuration_required" && (
        <section className="cv-browser" aria-label="Civi's browser">
          <header>
            <Globe size={14} aria-hidden="true" />
            <strong>Civi’s browser</strong>
            <span
              className={`cv-browser-chip${(busy && browser) || (live && !live.humanControl) ? " is-live" : ""}${live?.humanControl ? " is-human" : ""}`}
            >
              {live
                ? live.humanControl
                  ? "You’re in control"
                  : "Live"
                : busy && browser
                  ? "Live"
                  : /Starting Civi/.test(activity)
                    ? "Starting…"
                    : state.browser?.available === false && state.messages.length > 0
                      ? "Web search only"
                      : "Ready"}
            </span>
            <span className="cv-browser-title">{browser?.title ?? state.browser?.title ?? ""}</span>
            {live && (
              <>
                <button
                  type="button"
                  className="cv-browser-primary"
                  disabled={liveBusy}
                  onClick={() =>
                    void liveControl(live.humanControl ? "browser_handback" : "browser_takeover")
                  }
                >
                  {live.humanControl ? "Hand back to Civi" : "Take control"}
                </button>
                <button
                  type="button"
                  disabled={liveBusy}
                  onClick={() => void liveControl("browser_close")}
                >
                  Close
                </button>
              </>
            )}
            <button type="button" onClick={() => setBrowserOpen((open) => !open)}>
              {browserOpen ? "Hide" : "Show"}
            </button>
          </header>
          {browserOpen &&
            (live ? (
              <div className={`cv-browser-live${live.humanControl ? " is-human" : ""}`}>
                {/* Browserbase's live view: watch-only while Civi works, interactive when you take control. */}
                <iframe
                  title="Civi's live browser"
                  src={live.url}
                  sandbox="allow-same-origin allow-scripts"
                  allow="clipboard-read; clipboard-write"
                  referrerPolicy="no-referrer"
                  style={{ pointerEvents: live.humanControl ? "auto" : "none" }}
                />
                {!live.humanControl && (
                  <p>Civi is browsing. Take control any time; Civi waits until you hand it back.</p>
                )}
              </div>
            ) : browser?.screenshot || state.browser?.screenshot ? (
              <img
                src={browser?.screenshot ?? state.browser?.screenshot ?? ""}
                alt={`What Civi's browser shows: ${browser?.title ?? state.browser?.title ?? "the last page it opened"}`}
              />
            ) : (
              <div className="cv-browser-empty">
                <span>
                  {state.browser?.available === false && state.messages.length > 0
                    ? `This conversation uses web search: OpenAI didn't start the hosted browser for it.${state.browser?.note ? ` OpenAI said: ${state.browser.note}.` : ""} A new conversation tries the browser again.`
                    : "When Civi opens a website, you'll watch it here, live."}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMessage(
                      "Open reidparkzoo.org in your browser and tell me what events they have this month.",
                    )
                  }
                >
                  Try it: open a website
                </button>
              </div>
            ))}
        </section>
      )}
      <div className="civi-chat-scroll" aria-live="polite">
        {state.status === "configuration_required" && (
          <div className="cv-thread">
            <div className="cv-card">
              <strong>Civi is almost ready</strong>
              <p className="!mb-0 mt-1 text-sm text-muted-foreground">
                The conversational organizer needs its ChatGPT server key before it can reply. Your
                organization information and research tools are still available.
              </p>
            </div>
          </div>
        )}
        {state.status !== "configuration_required" && empty && (
          <div className="cv-greeting">
            <span className="cv-civi-avatar h-11 w-11" aria-hidden="true">
              <img src="/brand/civimeet-mark.svg" alt="" className="h-6 w-6 brightness-0 invert" />
            </span>
            <h2>
              Hi, I’m <span>Civi</span>.
            </h2>
            <p>What are we bringing your community together for today?</p>
            {report}
            <div className="cv-suggestions">
              {suggestions.map(([title, hint, prompt]) => (
                <button
                  key={title}
                  type="button"
                  className="cv-suggestion"
                  onClick={() => setMessage(prompt)}
                >
                  <b>{title}</b>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {!empty && (
          <div className="cv-thread">
            {state.hasOlderMessages && (
              <p className="text-center text-xs text-muted-foreground">
                Showing the most recent saved messages.
              </p>
            )}
            {state.messages.map((m) =>
              m.role === "user" ? (
                <article key={m.id} className="cv-msg-user" aria-label="Your team">
                  {m.text}
                </article>
              ) : (
                <article key={m.id} className="cv-msg-agent" aria-label="Civi">
                  <span className="cv-civi-avatar mt-0.5 h-7 w-7" aria-hidden="true">
                    <img
                      src="/brand/civimeet-mark.svg"
                      alt=""
                      className="h-4 w-4 brightness-0 invert"
                    />
                  </span>
                  <div>
                    {m.text}
                    <div className="cv-msg-actions">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard?.writeText(m.text)}
                      >
                        <Copy size={13} className="mr-1 inline" /> Copy
                      </button>
                      {onDraft && (
                        <button type="button" onClick={() => onDraft(m.text)}>
                          <FileCheck2 size={13} className="mr-1 inline" /> Prepare for review
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ),
            )}
            {busy && Object.values(parts).length > 0 && (
              <article className="cv-msg-agent" aria-label="Civi">
                <span className="cv-civi-avatar mt-0.5 h-7 w-7 animate-pulse" aria-hidden="true" />
                <div>{Object.values(parts).join("\n\n")}</div>
              </article>
            )}
            {activity && (
              <p className="text-sm text-muted-foreground" role="status">
                {activity}
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="cv-thread">
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          </div>
        )}
      </div>
      {state.status !== "configuration_required" && (
        <div className="cv-composer-wrap">
          {(state.needsResume || state.status === "in_progress") && !busy && (
            <div className="mx-auto mb-2 flex max-w-[760px] gap-2">
              {state.needsResume && (
                <button className="cv-chip" onClick={() => void run("resume")}>
                  Continue saved task
                </button>
              )}
              {state.status === "in_progress" && (
                <button className="cv-chip" onClick={() => void run("resume")}>
                  Reconnect to live task
                </button>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("send");
            }}
            className="cv-composer"
          >
            <textarea
              aria-label="Message your community organizer"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={6000}
              rows={1}
              placeholder="Message Civi"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void run("send");
                }
              }}
              disabled={role === "viewer"}
            />
            <div className="cv-composer-row">
              <small className="text-[12px] text-muted-foreground">
                Civi asks before anything is posted, sent or paid above your limit.
              </small>
              <button
                aria-label="Send to organizer"
                className="cv-send"
                disabled={sending || !message.trim() || role === "viewer"}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </form>
          <p className="cv-fineprint">Your community. Your voice. Your final say.</p>
        </div>
      )}
    </section>
  );
}
