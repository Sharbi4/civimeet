import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Globe, PanelRightOpen } from "lucide-react";
import { connectors } from "@/lib/connectors";
import { BrandLogo } from "./BrandLogo";
import { BrowserRun } from "./BrowserRun";
import { PlatformBrowser } from "./BrowserDock";
import { LiveBrowser } from "./Connectors";
import { useChatActions } from "./ChatActions";

/** Accounts the agent can open in its own browser (sign in live, or watch and take over). */
const browserPlatforms = connectors.filter(
  (item) => item.methods.includes("browser") && item.loginUrl,
);
const liveRun = ["running", "waiting_for_human", "paused"];
const frame = "block h-[clamp(300px,52dvh,620px)] w-full bg-slate-100";

/**
 * The agent's browser, at the top of the chat. Whatever the agent or the person is doing in a
 * browser (a sign-in, a take-over, a read-only agent run, public-web research) shows here, with
 * the conversation underneath. Opening an account goes through the same chat action executor as
 * typing "Open Facebook", so every attempt and its real outcome is recorded in the thread.
 */
export function ChatBrowser({
  thread,
  connector,
  demo,
  admin,
  connected,
  webAgentId,
  onShowPanel,
}: {
  thread: string;
  connector?: string | undefined;
  demo: boolean;
  admin: boolean;
  connected: string[];
  webAgentId: string | null;
  onShowPanel?: (() => void) | undefined;
}) {
  const actions = useChatActions();
  const session = actions?.liveSession ?? null;
  const run = actions?.agentRun ?? null;
  const [open, setOpen] = useState(true);
  const [web, setWeb] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const stage = useRef<HTMLElement>(null);

  useEffect(() => {
    const reveal = () => {
      setOpen(true);
      stage.current?.scrollIntoView?.({ block: "nearest" });
    };
    const browse = () => {
      setWeb(true);
      reveal();
    };
    const panel = (event: Event) => {
      if ((event as CustomEvent<{ tab?: string }>).detail?.tab === "browser") reveal();
    };
    window.addEventListener("civimeet:browse", browse);
    window.addEventListener("civimeet:panel", panel);
    return () => {
      window.removeEventListener("civimeet:browse", browse);
      window.removeEventListener("civimeet:panel", panel);
    };
  }, []);
  const runId = run?.id;
  useEffect(() => {
    if (session || runId) setOpen(true);
  }, [session, runId]);

  const platforms = connector
    ? browserPlatforms.filter((item) => item.id === connector)
    : browserPlatforms;
  const canOpen = demo || admin;
  async function openPlatform(id: string, name: string) {
    if (!actions) return;
    setOpening(id);
    try {
      await actions.run({ type: "connect_platform", platform: id }, `Open ${name}`, thread);
    } finally {
      setOpening(null);
    }
  }

  const running = Boolean(run && liveRun.includes(run.status));
  const title = session
    ? session.mode === "sign_in"
      ? `${session.name} sign-in · you’re in control`
      : `${session.name} · you’re in control`
    : run
      ? `${run.name} agent · read-only`
      : web
        ? "Public websites"
        : "Agent browser";
  const dot = session || running ? "bg-emerald-500" : "bg-slate-300";

  return (
    <section
      ref={stage}
      aria-label="Agent browser"
      className="mx-auto w-full max-w-[960px] shrink-0 border-b border-[#e4e9ec] bg-[#f8fafb] px-4 pb-3 pt-3 md:px-6"
    >
      <div className="flex items-center gap-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </span>
        <span className="ml-1 inline-flex min-w-0 flex-1 items-center gap-2 truncate rounded-full border border-[#e4e9ec] bg-white px-3 py-1 text-[12px] text-[#475569]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{title}</span>
          {run?.url && !session && <span className="truncate text-[#8191a3]">· {run.url}</span>}
        </span>
        {web && !session && !run && (
          <button
            type="button"
            onClick={() => setWeb(false)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[#475569] hover:bg-white"
          >
            <ArrowLeft size={13} /> Accounts
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[#475569] hover:bg-white"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? "Hide browser" : "Show browser"}
        </button>
        {onShowPanel && (
          <button
            type="button"
            onClick={onShowPanel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e9ec] bg-white px-2.5 py-1 text-[12px] font-medium text-[#142d40] hover:bg-slate-50"
          >
            <PanelRightOpen size={14} /> Agent panel
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {session && actions ? (
            <LiveBrowser
              name={session.name}
              viewer={{ url: session.viewer, expiresAt: session.expiresAt }}
              busy={actions.busy}
              title={title}
              frameClassName={frame}
              onFinish={session.mode === "sign_in" ? () => void actions.finishSignIn() : undefined}
              cancelLabel={session.mode === "sign_in" ? "Cancel" : "Give back to agent"}
              onCancel={() => void actions.closeSession()}
              onExpired={() => void actions.sessionExpired()}
            />
          ) : run && actions ? (
            <div className="max-h-[clamp(320px,56dvh,660px)] overflow-y-auto rounded-2xl border border-[#e4e9ec] bg-white p-4">
              <BrowserRun
                run={run}
                busy={actions.busy}
                onControl={(command) => void actions.controlRun(command)}
              />
            </div>
          ) : web && webAgentId && !demo ? (
            <div className="max-h-[clamp(320px,56dvh,660px)] overflow-y-auto rounded-2xl border border-[#e4e9ec] bg-white">
              <PlatformBrowser agentId={webAgentId} />
            </div>
          ) : (
            <div className="rounded-2xl border border-[#e4e9ec] bg-white p-4">
              <p className="!mb-3 text-[13px] text-[#475569]">
                {connector
                  ? "Open this account in the agent’s secure browser. It appears right here."
                  : "Open an account in the agent’s secure browser. It appears right here, and you can watch, take over or stop."}{" "}
                You sign in yourself; Civi never sees your password.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {platforms.map((item) => {
                  const signedIn = connected.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!canOpen || Boolean(opening) || Boolean(actions?.busy)}
                      onClick={() => void openPlatform(item.id, item.name)}
                      className="flex items-center gap-2 rounded-xl border border-[#e4e9ec] px-3 py-2 text-left transition hover:border-[#b9c9ff] hover:bg-[#f5f8ff] disabled:opacity-60"
                    >
                      <BrandLogo id={item.id} size={22} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-[#142d40]">
                          {item.name}
                        </span>
                        <span className="block text-[11px] text-[#64717a]">
                          {opening === item.id
                            ? "Opening…"
                            : signedIn
                              ? "Signed in · open"
                              : "Sign in"}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!connector && webAgentId && !demo && (
                  <button
                    type="button"
                    onClick={() => setWeb(true)}
                    className="flex items-center gap-2 rounded-xl border border-[#e4e9ec] px-3 py-2 text-left transition hover:border-[#b9c9ff] hover:bg-[#f5f8ff]"
                  >
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#edf3ff] text-[#0640d4]">
                      <Globe size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[#142d40]">
                        Public websites
                      </span>
                      <span className="block text-[11px] text-[#64717a]">Research</span>
                    </span>
                  </button>
                )}
              </div>
              {!canOpen && (
                <p className="!mb-0 mt-3 text-[12px] text-[#64717a]">
                  Only an organization owner or administrator can open accounts in the agent
                  browser.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
