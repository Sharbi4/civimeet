import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Monitor, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approvedBrowserUrl,
  browserStateLabel,
  type BrowserCommand,
  type BrowserWorkspace,
} from "@/lib/browser-workspace";

type Scope = {
  db: SupabaseClient;
  organizationId: string;
  name: string;
  userId: string;
  role: string;
};
const BrowserScope = createContext<((scope: Scope | null) => void) | null>(null);
export function useBrowserScope(scope: Scope | null) {
  const register = useContext(BrowserScope);
  const { db, organizationId, name, userId, role } = scope ?? {};
  useEffect(() => {
    if (db && organizationId && name && userId && role)
      register?.({ db, organizationId, name, userId, role });
  }, [register, organizationId, userId, role, name, db]);
}
export function BrowserWorkspaceProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [split, setSplit] = useState(false);
  const db = scope?.db;
  const userId = scope?.userId;
  useEffect(() => {
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) setScope(null);
    });
    return () => data.subscription.unsubscribe();
  }, [db, userId]);
  return (
    <BrowserScope.Provider value={setScope}>
      <div className={scope && split ? "md:pr-[50vw]" : ""}>{children}</div>
      {scope && (
        <BrowserDock
          key={`${scope.organizationId}:${scope.userId}:${scope.role}`}
          scope={scope}
          onSplit={setSplit}
        />
      )}
    </BrowserScope.Provider>
  );
}
function BrowserDock({ scope, onSplit }: { scope: Scope; onSplit: (value: boolean) => void }) {
  const [layout, setLayout] = useState<"collapsed" | "panel" | "split" | "full">("collapsed");
  useEffect(() => {
    onSplit(layout === "split");
    return () => onSplit(false);
  }, [layout, onSplit]);
  const [agents, setAgents] = useState<
    { id: string; name: string; platform: string; selected: boolean; paused: boolean }[]
  >([]);
  const [sessions, setSessions] = useState<BrowserWorkspace[]>([]);
  const [actions, setActions] = useState<
    { id: string; action: string; outcome: string; created_at: string }[]
  >([]);
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<{
    screenshot?: string;
    viewer?: string;
    expiresAt?: string;
  } | null>(null);
  const [url, setUrl] = useState("");
  const [sitePermission, setSitePermission] = useState(false);
  const [sites, setSites] = useState<string[]>([]);
  const [task, setTask] = useState("Review a permitted community resource");
  const mounted = useRef(true);
  const selection = useRef(agentId);
  selection.current = agentId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const administrator = ["owner", "admin"].includes(scope.role);
  const session = sessions.find((item) => item.agent_id === agentId);
  const agent = agents.find((item) => item.id === agentId);
  const load = useCallback(async () => {
    const siteRows = await scope.db
      .from("browser_sites")
      .select("origin")
      .eq("organization_id", scope.organizationId);
    if (mounted.current && !siteRows.error)
      setSites((siteRows.data ?? []).map((item) => item.origin));
    const [agentRows, sessionRows] = await Promise.all([
      scope.db
        .from("platform_agents")
        .select("id,name,platform,selected,paused")
        .eq("organization_id", scope.organizationId)
        .order("platform"),
      scope.db.from("browser_workspaces").select("*").eq("organization_id", scope.organizationId),
    ]);
    if (!mounted.current) return;
    if (agentRows.error || sessionRows.error) {
      setError("Browser workspace status could not be loaded.");
      return;
    }
    setAgents(agentRows.data ?? []);
    setSessions((sessionRows.data ?? []) as BrowserWorkspace[]);
    setAgentId(
      (current) => current || agentRows.data?.find((item) => item.platform === "web")?.id || "",
    );
  }, [scope.db, scope.organizationId]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    fetch("/api/browser/command")
      .then((r) => r.json())
      .then((data) => {
        if (mounted.current) {
          setConfigured(data.configured === true);
          setHandoff(data.handoffEnabled === true);
        }
      })
      .catch(() => {
        if (mounted.current) setError("Browser service availability could not be checked.");
      });
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    let active = true;
    setActions([]);
    if (session?.id)
      scope.db
        .from("browser_actions")
        .select("id,action,outcome,created_at")
        .eq("organization_id", scope.organizationId)
        .eq("workspace_id", session.id)
        .neq("action", "observe")
        .order("created_at", { ascending: false })
        .limit(8)
        .then(({ data }) => {
          if (active) setActions(data ?? []);
        });
    return () => {
      active = false;
    };
  }, [agentId, session?.id, session?.updated_at, scope.db, scope.organizationId]);
  useEffect(() => {
    if (!media?.expiresAt) return;
    const timer = setTimeout(
      () => setMedia(null),
      Math.max(0, Date.parse(media.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [media?.expiresAt]);
  async function command(command: BrowserCommand["command"]) {
    if (busy) return;
    const selected = agentId;
    setBusy(true);
    setError("");
    if (command !== "observe") setMedia(null);
    try {
      const { data } = await scope.db.auth.getSession();
      if (!data.session) throw new Error("Sign in again to open the browser.");
      const response = await fetch("/api/browser/command", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: scope.organizationId,
          agentId: selected,
          requestId: crypto.randomUUID(),
          command,
          task,
          ...(["start", "navigate"].includes(command) && url ? { url } : {}),
        }),
      });
      const result = await response.json();
      if (!mounted.current || selection.current !== selected) return;
      if (!response.ok) throw new Error(result.error ?? "Browser request failed.");
      await load();
      if (result.viewer || result.screenshot) setMedia(result);
    } catch (e) {
      if (mounted.current && selection.current === selected) {
        setMedia(null);
        setError(e instanceof Error ? e.message : "Browser connection failed.");
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function authorizeSite() {
    setBusy(true);
    setError("");
    try {
      const origin = new URL(url).origin;
      approvedBrowserUrl(url, [origin]);
      if (!sitePermission)
        throw new Error("Confirm that your organization is authorized to use this website.");
      const { error } = await scope.db
        .from("browser_sites")
        .insert({ organization_id: scope.organizationId, origin, approved_by: scope.userId });
      if (error) throw new Error("Could not authorize this website. It may already be approved.");
      await load();
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Could not authorize website.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const active = Boolean(
    session?.expires_at &&
    Date.parse(session.expires_at) > Date.now() &&
    !["not_connected", "session_expired", "paused"].includes(session.state),
  );
  const state =
    session && session.expires_at && Date.parse(session.expires_at) <= Date.now()
      ? "session_expired"
      : (session?.state ?? "not_connected");
  if (layout === "collapsed")
    return (
      <Button className="fixed bottom-5 right-5 z-40 shadow-lg" onClick={() => setLayout("panel")}>
        <Monitor size={16} className="mr-2" />
        Steward browser{session?.state === "authentication_required" ? " · Needs you" : ""}
      </Button>
    );
  return (
    <aside
      aria-label="Community Steward live browser"
      className={`fixed z-40 flex flex-col border bg-background shadow-2xl ${layout === "full" ? "inset-0" : layout === "split" ? "inset-y-0 right-0 w-full md:w-1/2" : "bottom-4 right-4 top-20 w-[min(680px,calc(100vw-2rem))] rounded-xl"}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Community Steward · Live workspace</h2>
          <p className="text-xs text-muted-foreground">{scope.name}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLayout(layout === "split" ? "panel" : "split")}
          >
            Split
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLayout(layout === "full" ? "panel" : "full")}
          >
            Full screen
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Collapse browser"
            onClick={() => setLayout("collapsed")}
          >
            <Minimize2 size={16} />
          </Button>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block text-sm">
          Agent session
          <select
            aria-label="Agent session"
            className="mt-2 w-full rounded-md border bg-background p-2"
            disabled={busy}
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setMedia(null);
              setError("");
            }}
          >
            {agents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.platform}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="capitalize">{browserStateLabel(state)}</span>
          <span className="text-xs text-muted-foreground">
            {active ? "Session open" : "No active connection"}
          </span>
        </div>
        <p className="text-sm">
          {session?.task || "Contribute → Connect → Convene → Follow through"}
        </p>
        {session?.current_origin && (
          <p className="break-all text-xs text-muted-foreground">
            Current website: {session.current_origin}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="min-h-64 overflow-hidden rounded-lg border bg-muted/40">
          {media?.viewer && active ? (
            <iframe
              title="Private browser control"
              src={media.viewer}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms"
              className="h-[600px] w-full border-0"
            />
          ) : media?.screenshot ? (
            <img src={media.screenshot} alt="Latest actual browser capture" className="w-full" />
          ) : (
            <div className="p-8 text-center text-sm leading-6 text-muted-foreground">
              <Monitor className="mx-auto mb-3" />
              {!configured
                ? "Live browser setup is not complete yet."
                : !administrator
                  ? "An organization administrator can open and control browser sessions."
                  : agent?.platform !== "web"
                    ? "Browser automation for this platform is not enabled yet."
                    : state === "authentication_required"
                      ? "This page needs private human review. Its contents are hidden."
                      : "Open an authorized website, then inspect its real browser view. No activity is simulated."}
            </div>
          )}
        </div>
        {media?.screenshot && (
          <p className="text-xs text-muted-foreground">
            Latest verified capture. Select “Inspect browser” to refresh.
          </p>
        )}
        {administrator && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!configured || busy || !active}
                onClick={() => void command("observe")}
              >
                Inspect browser
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !handoff ||
                  busy ||
                  !active ||
                  Boolean(session?.human_actor && session.human_actor !== scope.userId)
                }
                onClick={() => void command("takeover")}
              >
                Take control
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || session?.human_actor !== scope.userId}
                onClick={() => void command("resume")}
              >
                Return control to agent
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !session}
                onClick={() => void command("pause")}
              >
                Pause / stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !session}
                onClick={() => void command("disconnect")}
              >
                Disconnect
              </Button>
            </div>
            {!handoff && (
              <p className="text-xs text-muted-foreground">
                Private login handoff is awaiting verification. Do not enter credentials into
                research or planning fields.
              </p>
            )}
            {agent?.platform === "web" && (
              <form
                className="space-y-3 rounded-lg border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void command(active ? "navigate" : "start");
                }}
              >
                <label className="block text-sm">
                  Community task
                  <Input
                    className="mt-2"
                    maxLength={500}
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Authorized website
                  <Input
                    className="mt-2"
                    required
                    type="url"
                    placeholder="https://your-approved-site.org/resources"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Authorized websites</summary>
                  <p className="mt-2">
                    {sites.length ? sites.join(", ") : "No websites approved yet."}
                  </p>
                  <label className="mt-3 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={sitePermission}
                      onChange={(e) => setSitePermission(e.target.checked)}
                    />
                    I confirm my organization has permission to use browser automation on the
                    website entered above.
                  </label>
                  <Button
                    className="mt-3"
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !sitePermission || !url}
                    onClick={() => void authorizeSite()}
                  >
                    Authorize this website
                  </Button>
                </details>
                <p className="text-xs text-muted-foreground">
                  This authorizes only opening this exact page. Posting, messaging, booking, and
                  payment actions remain unavailable.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={
                      !configured ||
                      busy ||
                      !agent.selected ||
                      agent.paused ||
                      Boolean(session?.human_actor)
                    }
                  >
                    Approve & open page
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !active || Boolean(session?.human_actor)}
                    onClick={() => void command("scroll")}
                  >
                    Scroll down
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
        <section>
          <h3 className="text-sm font-semibold">Recent actions</h3>
          {!actions.length && (
            <p className="mt-2 text-xs text-muted-foreground">No browser actions recorded.</p>
          )}
          {actions.map((item) => (
            <p key={item.id} className="mt-2 text-xs capitalize">
              {item.action} · {item.outcome} · {new Date(item.created_at).toLocaleTimeString()}
            </p>
          ))}
        </section>
      </div>
    </aside>
  );
}
