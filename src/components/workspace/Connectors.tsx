import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  MonitorPlay,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { BrandLogo } from "./BrandLogo";
import { useWorkspace } from "./WorkspaceGate";
import {
  autopilotUnlocksAt,
  connectorCategories,
  connectors,
  methodLabels,
  oauthEnvNames,
  readCommentSettings,
  statusCopy,
  type CommentSettings,
  type ConnectMethod,
  type ConnectorDefinition,
  type ConnectorEvent,
  type ConnectorRow,
  type ConnectorStatus,
  type OAuthProvider,
} from "@/lib/connectors";

type Capabilities = { browser: boolean; oauth: Partial<Record<OAuthProvider, boolean>> };
type CommandBody =
  | {
      command:
        | "browser_start"
        | "browser_observe"
        | "browser_finish"
        | "browser_cancel"
        | "verify"
        | "disconnect"
        | "oauth_start";
      connector: string;
    }
  | {
      command: "save_credentials";
      connector: string;
      credentials: { identifier: string; password: string; handle?: string };
    };
type CommandResult = {
  status?: ConnectorStatus;
  viewer?: string;
  expiresAt?: string;
  message?: string;
  redirect?: string;
};
type Notice = { tone: "info" | "good" | "warn"; text: string };
type Actions = {
  command: (body: CommandBody) => Promise<CommandResult>;
  saveSettings: (connector: string, settings: CommentSettings) => Promise<void>;
};
type ListProps = {
  rows: Record<string, ConnectorRow>;
  events: ConnectorEvent[];
  capabilities: Capabilities | null;
  admin: boolean;
  demo: boolean;
  live: boolean;
  loadError: string;
  actions: Actions;
  initialOpen?: string | undefined;
  initialNotice?: Notice | undefined;
};

const ICON = { browser: MonitorPlay, credentials: KeyRound, oauth: Globe } as const;

function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (Number.isNaN(seconds)) return "";
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function LiveConnectors() {
  const { db, organizationId, role } = useWorkspace();
  const [rows, setRows] = useState<Record<string, ConnectorRow>>({});
  const [events, setEvents] = useState<ConnectorEvent[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [live, setLive] = useState(false);
  const [loadError, setLoadError] = useState("");
  const initial = useMemo(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const connector = params.get("connector") ?? undefined;
    const result = params.get("result");
    const name = connectors.find((item) => item.id === connector)?.name ?? "The platform";
    const notice: Notice | undefined =
      result === "connected"
        ? { tone: "good", text: `${name} is connected.` }
        : result === "cancelled"
          ? { tone: "warn", text: `${name} sign-in was cancelled.` }
          : result === "failed"
            ? { tone: "warn", text: `${name} did not finish the sign-in. Try again.` }
            : result === "expired"
              ? { tone: "warn", text: "That sign-in link expired. Start again." }
              : undefined;
    return { connector, notice };
  }, []);

  const load = useCallback(async () => {
    const [connectorRows, recent] = await Promise.all([
      db
        .from("organization_connectors")
        .select(
          "connector,method,status,account_label,detail,settings,connected_at,last_checked_at,updated_at",
        )
        .eq("organization_id", organizationId),
      db
        .from("connector_events")
        .select("id,connector,action,message,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);
    if (connectorRows.error || recent.error) {
      setLoadError("Connections could not load. Refresh to try again.");
      return;
    }
    setLoadError("");
    setRows(
      Object.fromEntries(
        ((connectorRows.data ?? []) as ConnectorRow[]).map((row) => [row.connector, row]),
      ),
    );
    setEvents((recent.data ?? []) as ConnectorEvent[]);
  }, [db, organizationId]);

  useEffect(() => {
    void load();
    let alive = true;
    fetch("/api/connectors")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => alive && setCapabilities(value))
      .catch(() => alive && setCapabilities(null));
    // Live status: any change to this organization's connections refreshes the list.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 150);
    };
    const channel = db
      .channel(`connectors:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organization_connectors",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connector_events",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .subscribe((state) => alive && setLive(state === "SUBSCRIBED"));
    return () => {
      alive = false;
      clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [db, organizationId, load]);

  const actions = useMemo<Actions>(
    () => ({
      async command(body) {
        const { data } = await db.auth.getSession();
        if (!data.session) throw new Error("Sign in again to manage connections.");
        const response = await fetch("/api/connectors", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ organizationId, ...body }),
        });
        const payload = (await response.json().catch(() => ({}))) as CommandResult & {
          error?: string;
        };
        await load();
        if (!response.ok)
          throw new Error(payload.error ?? "The connection could not be completed.");
        return payload;
      },
      async saveSettings(connector, settings) {
        const { error } = await db.rpc("save_connector_settings", {
          workspace: organizationId,
          target: connector,
          next_settings: settings,
        });
        if (error) throw new Error(error.message);
        await load();
      },
    }),
    [db, organizationId, load],
  );

  return (
    <ConnectorList
      rows={rows}
      events={events}
      capabilities={capabilities}
      admin={role === "owner" || role === "admin"}
      demo={false}
      live={live}
      loadError={loadError}
      actions={actions}
      initialOpen={initial.connector}
      initialNotice={initial.notice}
    />
  );
}

const day = 86_400_000;
const sampleRows = (): Record<string, ConnectorRow> => {
  const now = Date.now();
  const row = (
    connector: string,
    status: ConnectorStatus,
    method: ConnectMethod,
    label: string,
    connectedDaysAgo: number | null,
    detail = "",
  ): ConnectorRow => ({
    connector,
    status,
    method,
    account_label: label,
    detail,
    settings: {},
    connected_at:
      connectedDaysAgo === null ? null : new Date(now - connectedDaysAgo * day).toISOString(),
    last_checked_at: new Date(now - 6 * 60_000).toISOString(),
    updated_at: new Date(now - 6 * 60_000).toISOString(),
  });
  return {
    facebook: row("facebook", "connected", "browser", "Tucson Community Alliance", 21),
    instagram: row(
      "instagram",
      "needs_verification",
      "credentials",
      "tu•••",
      null,
      "Instagram wants to confirm it’s you. Finish the check in the live browser.",
    ),
    google_calendar: row("google_calendar", "connected", "oauth", "events@tucsonalliance.org", 9),
    eventbrite: row(
      "eventbrite",
      "saved",
      "credentials",
      "ev•••@tucsonalliance.org",
      null,
      "Login saved. Open the live browser once to finish the first sign-in.",
    ),
  };
};
export function DemoConnectors() {
  const [rows] = useState(sampleRows);
  const events = useMemo<ConnectorEvent[]>(
    () => [
      {
        id: "e1",
        connector: "facebook",
        action: "verified",
        message: "Agent confirmed it is still signed in",
        created_at: new Date(Date.now() - 6 * 60_000).toISOString(),
      },
      {
        id: "e2",
        connector: "instagram",
        action: "verification_needed",
        message: "Security check needed",
        created_at: new Date(Date.now() - 42 * 60_000).toISOString(),
      },
      {
        id: "e3",
        connector: "google_calendar",
        action: "oauth_connected",
        message: "Connected events@tucsonalliance.org",
        created_at: new Date(Date.now() - 9 * day).toISOString(),
      },
    ],
    [],
  );
  const actions = useMemo<Actions>(
    () => ({
      command: async () => ({
        message: "Sample workspace. Sign in to your organization to connect real accounts.",
      }),
      saveSettings: async () => {},
    }),
    [],
  );
  return (
    <ConnectorList
      rows={rows}
      events={events}
      capabilities={{
        browser: true,
        oauth: {
          google: true,
          meta_pages: true,
          meta_instagram: true,
          linkedin: true,
          eventbrite: true,
          zoom: true,
        },
      }}
      admin
      demo
      live
      loadError=""
      actions={actions}
    />
  );
}

type Filter = "all" | "connected" | "attention";
const attention: ConnectorStatus[] = [
  "saved",
  "needs_verification",
  "needs_attention",
  "awaiting_sign_in",
];

export function ConnectorList({
  rows,
  events,
  capabilities,
  admin,
  demo,
  live,
  loadError,
  actions,
  initialOpen,
  initialNotice,
}: ListProps) {
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const statusOf = (id: string): ConnectorStatus => rows[id]?.status ?? "not_connected";
  const connectedCount = connectors.filter((item) => statusOf(item.id) === "connected").length;
  const attentionCount = connectors.filter((item) => attention.includes(statusOf(item.id))).length;
  const visible = connectors.filter((item) => {
    const text = `${item.name} ${item.summary}`.toLowerCase();
    if (query && !text.includes(query.trim().toLowerCase())) return false;
    if (filter === "connected") return statusOf(item.id) === "connected";
    if (filter === "attention") return attention.includes(statusOf(item.id));
    return true;
  });

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="!mb-1 text-[26px] font-semibold tracking-tight text-slate-900">
            Connections
          </h2>
          <p className="!mb-0 max-w-xl text-[14px] text-slate-500">
            Sign your agent in where your community lives. It works from these accounts to post,
            comment, message vendors and run events.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <SummaryChip tone="good" value={connectedCount} label="connected" />
          {attentionCount > 0 && (
            <SummaryChip
              tone="warn"
              value={attentionCount}
              label={attentionCount === 1 ? "needs you" : "need you"}
            />
          )}
          <span
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600"
            title={live ? "Updates appear as they happen" : "Connecting to live updates"}
          >
            <Dot tone={live ? "live" : "idle"} />
            {live ? "Live" : "Connecting"}
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search connections</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search platforms"
            className="!w-full !rounded-xl !py-2.5 !pl-9"
          />
        </label>
        <Segmented<Filter>
          label="Filter connections"
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "All"],
            ["connected", "Connected"],
            ["attention", "Needs you"],
          ]}
        />
      </div>

      {loadError && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {loadError}
        </p>
      )}
      {!admin && !demo && (
        <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-[13px] text-slate-600">
          Only an organization owner or administrator can connect or change accounts.
        </p>
      )}

      {connectorCategories.map((category) => {
        const items = visible.filter((item) => item.category === category.id);
        if (!items.length) return null;
        return (
          <section key={category.id} className="mt-8" aria-labelledby={`connectors-${category.id}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3
                id={`connectors-${category.id}`}
                className="!m-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              >
                {category.label}
              </h3>
              <span className="text-[12px] text-slate-400">{category.blurb}</span>
            </div>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.08)]">
              {items.map((definition) => (
                <ConnectorItem
                  key={definition.id}
                  definition={definition}
                  row={rows[definition.id]}
                  events={events.filter((event) => event.connector === definition.id).slice(0, 5)}
                  capabilities={capabilities}
                  admin={admin}
                  demo={demo}
                  open={open === definition.id}
                  onToggle={() =>
                    setOpen((current) => (current === definition.id ? null : definition.id))
                  }
                  actions={actions}
                  now={now}
                  initialNotice={definition.id === initialOpen ? initialNotice : undefined}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {!visible.length && (
        <p className="mt-10 text-center text-[14px] text-slate-500">
          No platforms match that search.
        </p>
      )}
      <p className="mt-8 flex items-start gap-2 text-[12px] leading-relaxed text-slate-400">
        <Lock size={14} className="mt-0.5 shrink-0" />
        Saved logins and access tokens are encrypted before they are stored and are never shown
        again. Disconnecting deletes the saved login and the agent’s browser profile.
      </p>
    </div>
  );
}

function ConnectorItem({
  definition,
  row,
  events,
  capabilities,
  admin,
  demo,
  open,
  onToggle,
  actions,
  now,
  initialNotice,
}: {
  definition: ConnectorDefinition;
  row?: ConnectorRow | undefined;
  events: ConnectorEvent[];
  capabilities: Capabilities | null;
  admin: boolean;
  demo: boolean;
  open: boolean;
  onToggle: () => void;
  actions: Actions;
  now: number;
  initialNotice?: Notice | undefined;
}) {
  const status: ConnectorStatus = row?.status ?? "not_connected";
  const copy = statusCopy[status];
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(initialNotice ?? null);
  const [viewer, setViewer] = useState<{ url: string; expiresAt: string } | null>(null);
  const [reconnect, setReconnect] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const panelId = `connector-panel-${definition.id}`;
  const connected = status === "connected";

  useEffect(() => {
    // A finished sign-in, from this tab or another administrator, closes the live browser.
    if (connected || status === "not_connected") setViewer(null);
    if (connected) setReconnect(false);
  }, [connected, status]);

  async function run(
    label: string,
    body: CommandBody,
    success?: (result: CommandResult) => Notice | null,
  ) {
    setBusy(label);
    setNotice(null);
    try {
      const result = await actions.command(body);
      if (result.redirect) {
        window.location.assign(result.redirect);
        return;
      }
      if (result.viewer && result.expiresAt)
        setViewer({ url: result.viewer, expiresAt: result.expiresAt });
      else if (body.command === "browser_cancel" || result.status === "connected") setViewer(null);
      const next =
        success?.(result) ??
        (result.message ? { tone: demo ? "info" : "warn", text: result.message } : null);
      setNotice(next);
    } catch (error) {
      setNotice({
        tone: "warn",
        text: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  const resumable = (status === "awaiting_sign_in" || status === "needs_verification") && !viewer;
  return (
    <li className={`transition-colors ${open ? "bg-slate-50/60" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
      >
        <BrandLogo id={definition.id} size={42} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[15px] font-semibold text-slate-900">{definition.name}</span>
            {row?.account_label && status !== "not_connected" && (
              <span className="truncate text-[13px] text-slate-500">· {row.account_label}</span>
            )}
          </span>
          <span className="block truncate text-[13px] text-slate-500">{definition.summary}</span>
        </span>
        {definition.comingSoon ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-500">
            Coming soon
          </span>
        ) : (
          <StatusPill status={status} label={copy.label} />
        )}
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={panelId} className="space-y-5 px-5 pb-6 sm:pl-[78px]">
          <WorkChips items={definition.agentWork} />
          {notice && <NoticeLine notice={notice} />}
          {row?.detail && !notice && status !== "connected" && (
            <NoticeLine
              notice={{ tone: status === "awaiting_sign_in" ? "info" : "warn", text: row.detail }}
            />
          )}

          {definition.comingSoon ? (
            <p className="text-[13px] text-slate-500">
              Payments arrive with event budgets: your agent pays approved vendor quotes within the
              monthly limit you set.
            </p>
          ) : viewer ? (
            <LiveBrowser
              name={definition.name}
              viewer={viewer}
              busy={busy}
              onFinish={() =>
                run("finish", { command: "browser_finish", connector: definition.id }, (result) =>
                  result.status === "connected"
                    ? {
                        tone: "good",
                        text: `${definition.name} is connected. The agent will stay signed in.`,
                      }
                    : null,
                )
              }
              onCancel={() =>
                run("cancel", { command: "browser_cancel", connector: definition.id })
              }
              onExpired={() =>
                run("observe", { command: "browser_observe", connector: definition.id })
              }
            />
          ) : status === "verifying" || busy === "save" ? (
            <Working text={`Your agent is signing in to ${definition.name}…`} />
          ) : connected && !reconnect ? (
            <ConnectedPanel
              definition={definition}
              row={row!}
              events={events}
              admin={admin}
              busy={busy}
              now={now}
              confirmDisconnect={confirmDisconnect}
              onVerify={() =>
                run("verify", { command: "verify", connector: definition.id }, (result) =>
                  result.status === "connected"
                    ? { tone: "good", text: "The agent is signed in and ready." }
                    : null,
                )
              }
              onReconnect={() => setReconnect(true)}
              onDisconnect={() => {
                if (!confirmDisconnect) return setConfirmDisconnect(true);
                setConfirmDisconnect(false);
                void run("disconnect", { command: "disconnect", connector: definition.id }, () => ({
                  tone: "info",
                  text: `${definition.name} disconnected. The saved login and browser profile were deleted.`,
                }));
              }}
              onCancelDisconnect={() => setConfirmDisconnect(false)}
              actions={actions}
              demo={demo}
            />
          ) : (
            <>
              {resumable && (
                <button
                  type="button"
                  disabled={!admin || Boolean(busy)}
                  onClick={() =>
                    run("observe", { command: "browser_observe", connector: definition.id })
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm transition hover:bg-blue-700"
                >
                  <MonitorPlay size={16} /> Return to the live browser
                </button>
              )}
              <ConnectOptions
                definition={definition}
                capabilities={capabilities}
                admin={admin}
                busy={busy}
                onBrowser={() =>
                  run("browser", { command: "browser_start", connector: definition.id })
                }
                onOAuth={() => run("oauth", { command: "oauth_start", connector: definition.id })}
                onCredentials={(credentials) =>
                  run(
                    "save",
                    { command: "save_credentials", connector: definition.id, credentials },
                    (result) =>
                      result.status === "connected"
                        ? {
                            tone: "good",
                            text: `Login saved and the agent is signed in to ${definition.name}.`,
                          }
                        : result.message
                          ? {
                              tone: result.status === "saved" ? "info" : "warn",
                              text: result.message,
                            }
                          : null,
                  )
                }
              />
              {reconnect && (
                <button
                  type="button"
                  onClick={() => setReconnect(false)}
                  className="text-[13px] font-medium text-slate-500 underline-offset-4 hover:underline"
                >
                  Keep the current connection
                </button>
              )}
              {definition.risk && <RiskNote text={definition.risk} />}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ConnectOptions({
  definition,
  capabilities,
  admin,
  busy,
  onBrowser,
  onOAuth,
  onCredentials,
}: {
  definition: ConnectorDefinition;
  capabilities: Capabilities | null;
  admin: boolean;
  busy: string | null;
  onBrowser: () => void;
  onOAuth: () => void;
  onCredentials: (credentials: { identifier: string; password: string; handle?: string }) => void;
}) {
  const [method, setMethod] = useState<ConnectMethod>(definition.methods[0]!);
  const disabled = !admin || Boolean(busy);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      {definition.methods.length > 1 && (
        <Segmented<ConnectMethod>
          label={`How to connect ${definition.name}`}
          value={method}
          onChange={setMethod}
          options={definition.methods.map((item) => [item, methodLabels[item], ICON[item]])}
        />
      )}
      <div className={definition.methods.length > 1 ? "mt-4" : ""}>
        {method === "browser" && (
          <MethodBody
            title="Sign in through the agent’s browser"
            text={`A secure browser opens right here. Sign in to ${definition.name} the way you always do, including two-factor codes. The agent keeps that signed-in browser; your password is never stored.`}
            footer={
              capabilities && !capabilities.browser
                ? "The agent browser is not configured on this deployment yet."
                : undefined
            }
          >
            <PrimaryButton
              disabled={disabled || capabilities?.browser === false}
              busy={busy === "browser"}
              onClick={onBrowser}
              icon={<MonitorPlay size={16} />}
            >
              Open agent browser
            </PrimaryButton>
          </MethodBody>
        )}
        {method === "credentials" && definition.fields && (
          <CredentialForm
            definition={definition}
            disabled={disabled}
            busy={busy === "save"}
            onSubmit={onCredentials}
          />
        )}
        {method === "oauth" && definition.oauth && (
          <MethodBody
            title="Official sign-in"
            text={`You approve CiviMeet on ${definition.oauth.label.replace("Continue with ", "")}’s own page and can revoke access there at any time. Nothing to type here.`}
            footer={
              capabilities?.oauth[definition.oauth.provider] === false
                ? `Needs setup: register a ${definition.oauth.label.replace("Continue with ", "")} app and add ${oauthEnvNames[definition.oauth.provider]} to the server secrets.`
                : undefined
            }
          >
            <PrimaryButton
              disabled={disabled || capabilities?.oauth[definition.oauth.provider] === false}
              busy={busy === "oauth"}
              onClick={onOAuth}
              icon={<BrandLogo id={definition.id} size={20} className="!rounded-md" />}
              tone="light"
            >
              {definition.oauth.label}
            </PrimaryButton>
          </MethodBody>
        )}
      </div>
    </div>
  );
}

function CredentialForm({
  definition,
  disabled,
  busy,
  onSubmit,
}: {
  definition: ConnectorDefinition;
  disabled: boolean;
  busy: boolean;
  onSubmit: (credentials: { identifier: string; password: string; handle?: string }) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      identifier: values["identifier"] ?? "",
      password: values["password"] ?? "",
      ...(values["handle"] ? { handle: values["handle"] } : {}),
    });
    setValues((current) => ({ ...current, password: "" }));
  };
  const ready = Boolean(values["identifier"]?.trim().length && values["password"]?.length);
  return (
    <form onSubmit={submit} className="space-y-4" autoComplete="off">
      <div>
        <p className="!mb-1 text-[14px] font-semibold text-slate-900">Save a login for the agent</p>
        <p className="!mb-0 text-[13px] text-slate-500">
          The agent signs in to {definition.name} with these details in its own browser. If{" "}
          {definition.name} asks for a code, you finish that step live.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {definition.fields!.map((field) => (
          <label
            key={field.key}
            className={`block ${field.key === "handle" ? "sm:col-span-2" : ""}`}
          >
            <span className="mb-1.5 block text-[12px] font-medium text-slate-600">
              {field.label}
              {field.optional && <span className="font-normal text-slate-400"> · optional</span>}
            </span>
            <span className="relative block">
              <input
                name={`${definition.id}-${field.key}`}
                type={field.type === "password" && !reveal ? "password" : "text"}
                autoComplete={field.autoComplete === "current-password" ? "new-password" : "off"}
                spellCheck={false}
                required={!field.optional}
                value={values[field.key] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.key]: event.target.value }))
                }
                className={`!w-full !rounded-xl ${field.type === "password" ? "!pr-10" : ""}`}
              />
              {field.type === "password" && (
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                >
                  {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </span>
            {field.hint && (
              <span className="mt-1 block text-[12px] text-slate-400">{field.hint}</span>
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton
          type="submit"
          disabled={disabled || !ready}
          busy={busy}
          icon={<KeyRound size={16} />}
        >
          Save and sign in
        </PrimaryButton>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
          <Lock size={13} /> Encrypted (AES-256) before it’s stored. Never shown again.
        </span>
      </div>
    </form>
  );
}

function ConnectedPanel({
  definition,
  row,
  events,
  admin,
  busy,
  now,
  confirmDisconnect,
  onVerify,
  onReconnect,
  onDisconnect,
  onCancelDisconnect,
  actions,
  demo,
}: {
  definition: ConnectorDefinition;
  row: ConnectorRow;
  events: ConnectorEvent[];
  admin: boolean;
  busy: string | null;
  now: number;
  confirmDisconnect: boolean;
  onVerify: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onCancelDisconnect: () => void;
  actions: Actions;
  demo: boolean;
}) {
  const via =
    row.method === "oauth"
      ? "Official sign-in"
      : row.method === "credentials"
        ? "Saved login"
        : "Live sign-in";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="min-w-0">
          <p className="!mb-0.5 truncate text-[14px] font-semibold text-slate-900">
            {row.account_label || `${definition.name} account`}
          </p>
          <p className="!mb-0 text-[12px] text-slate-500">
            {via}
            {row.connected_at && <> · connected {ago(row.connected_at, now)}</>}
            {row.last_checked_at && <> · checked {ago(row.last_checked_at, now)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            disabled={!admin || Boolean(busy)}
            busy={busy === "verify"}
            onClick={onVerify}
            icon={<RefreshCw size={15} />}
          >
            Check connection
          </GhostButton>
          <GhostButton disabled={!admin || Boolean(busy)} onClick={onReconnect}>
            Sign in again
          </GhostButton>
          {confirmDisconnect ? (
            <>
              <GhostButton
                tone="danger"
                disabled={Boolean(busy)}
                onClick={onDisconnect}
                icon={<LogOut size={15} />}
              >
                Confirm disconnect
              </GhostButton>
              <GhostButton onClick={onCancelDisconnect}>Keep</GhostButton>
            </>
          ) : (
            <GhostButton
              tone="danger"
              disabled={!admin || Boolean(busy)}
              busy={busy === "disconnect"}
              onClick={onDisconnect}
              icon={<LogOut size={15} />}
            >
              Disconnect
            </GhostButton>
          )}
        </div>
      </div>
      {definition.commentControls && (
        <CommentControls
          connector={definition.id}
          name={definition.name}
          row={row}
          admin={admin}
          actions={actions}
          demo={demo}
        />
      )}
      {events.length > 0 && <Timeline events={events} now={now} />}
      {definition.risk && <RiskNote text={definition.risk} />}
    </div>
  );
}

function CommentControls({
  connector,
  name,
  row,
  admin,
  actions,
  demo,
}: {
  connector: string;
  name: string;
  row: ConnectorRow;
  admin: boolean;
  actions: Actions;
  demo: boolean;
}) {
  const saved = useMemo(() => readCommentSettings(row.settings), [row.settings]);
  const [draft, setDraft] = useState<CommentSettings>(saved);
  const [state, setState] = useState<{ busy: boolean; message: string }>({
    busy: false,
    message: "",
  });
  useEffect(() => setDraft(saved), [saved]);
  const unlocksAt = autopilotUnlocksAt(row.connected_at);
  const locked = !unlocksAt || unlocksAt.getTime() > Date.now();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  async function save() {
    setState({ busy: true, message: "" });
    try {
      await actions.saveSettings(connector, draft);
      setState({ busy: false, message: demo ? "Sample settings are not saved." : "Saved." });
    } catch (error) {
      setState({
        busy: false,
        message: error instanceof Error ? error.message : "Could not save.",
      });
    }
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="!mb-0.5 text-[14px] font-semibold text-slate-900">Community comments</p>
          <p className="!mb-0 text-[13px] text-slate-500">
            How your agent comments on {name} posts and in groups.
          </p>
        </div>
        <Segmented<CommentSettings["comment_mode"]>
          label="Comment mode"
          value={draft.comment_mode}
          onChange={(comment_mode) => setDraft((current) => ({ ...current, comment_mode }))}
          options={[
            ["approve_each", "Approve each"],
            ["autopilot", locked ? "Autopilot · locked" : "Autopilot", Sparkles, locked],
          ]}
        />
      </div>
      {locked && (
        <p className="!mb-0 mt-2 text-[12px] text-slate-400">
          Autopilot unlocks{" "}
          {unlocksAt
            ? `on ${unlocksAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
            : "14 days after connecting"}
          , once the account has a track record of approved comments.
        </p>
      )}
      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-slate-700">Daily comment limit</span>
            <span className="tabular-nums text-slate-900">{draft.daily_comment_limit} a day</span>
          </div>
          <Slider
            min={1}
            max={15}
            step={1}
            value={[draft.daily_comment_limit]}
            onValueChange={([value]) =>
              setDraft((current) => ({
                ...current,
                daily_comment_limit: value ?? current.daily_comment_limit,
              }))
            }
            disabled={!admin}
            aria-label="Daily comment limit"
          />
          <p className="!mb-0 mt-2 text-[12px] text-slate-400">
            Spread across the day at natural intervals, never repeating wording.
          </p>
        </div>
        <label className="flex items-center gap-3 text-[13px] text-slate-700 sm:justify-end">
          <Switch
            checked={draft.auto_pause}
            onCheckedChange={(auto_pause) => setDraft((current) => ({ ...current, auto_pause }))}
            disabled={!admin}
          />
          Pause at the first {name} warning
        </label>
      </div>
      {(dirty || state.message) && (
        <div className="mt-4 flex items-center gap-3">
          {dirty && (
            <PrimaryButton disabled={!admin || state.busy} busy={state.busy} onClick={save}>
              Save comment settings
            </PrimaryButton>
          )}
          {state.message && <span className="text-[12px] text-slate-500">{state.message}</span>}
        </div>
      )}
    </div>
  );
}

function LiveBrowser({
  name,
  viewer,
  busy,
  onFinish,
  onCancel,
  onExpired,
}: {
  name: string;
  viewer: { url: string; expiresAt: string };
  busy: string | null;
  onFinish: () => void;
  onCancel: () => void;
  onExpired: () => void;
}) {
  const [remaining, setRemaining] = useState(() => Date.parse(viewer.expiresAt) - Date.now());
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    const timer = setInterval(() => setRemaining(Date.parse(viewer.expiresAt) - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [viewer.expiresAt]);
  useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      onExpired();
    }
  }, [remaining, onExpired]);
  const seconds = Math.max(0, Math.floor(remaining / 1000));
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_-16px_rgba(15,23,42,.25)]">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[12px] text-slate-600">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </span>
        <span className="inline-flex items-center gap-2 font-medium text-slate-700">
          <Dot tone="live" /> Live · {name} sign-in
        </span>
        <span className="ml-auto tabular-nums text-slate-500" aria-live="polite">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} left
        </span>
      </div>
      <iframe
        title={`${name} sign-in in the agent browser`}
        src={viewer.url}
        className="block aspect-[16/10] w-full bg-slate-100"
        allow="clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
        <PrimaryButton disabled={Boolean(busy)} busy={busy === "finish"} onClick={onFinish}>
          I’m signed in
        </PrimaryButton>
        <GhostButton disabled={Boolean(busy)} busy={busy === "cancel"} onClick={onCancel}>
          Cancel
        </GhostButton>
        <span className="text-[12px] text-slate-400">
          Only you can see and control this browser. Nothing is recorded while you type.
        </span>
      </div>
    </div>
  );
}

function Timeline({ events, now }: { events: ConnectorEvent[]; now: number }) {
  return (
    <div>
      <p className="!mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        Recent activity
      </p>
      <ol className="space-y-2.5 border-l border-slate-200 pl-4">
        {events.map((event) => (
          <li key={event.id} className="relative text-[13px] text-slate-600">
            <span
              className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-4 ring-white ${
                /failed|needed/.test(event.action)
                  ? "bg-amber-400"
                  : /connected|verified|finished/.test(event.action)
                    ? "bg-emerald-500"
                    : "bg-slate-300"
              }`}
            />
            {event.message || event.action.replaceAll("_", " ")}
            <span className="ml-2 text-[12px] text-slate-400">{ago(event.created_at, now)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function WorkChips({ items }: { items: string[] }) {
  return (
    <div>
      <p className="!mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        What your agent does here
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-600"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function MethodBody({
  title,
  text,
  footer,
  children,
}: {
  title: string;
  text: string;
  footer?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="!mb-1 text-[14px] font-semibold text-slate-900">{title}</p>
        <p className="!mb-0 max-w-2xl text-[13px] text-slate-500">{text}</p>
      </div>
      {children}
      {footer && <p className="!mb-0 text-[12px] text-amber-700">{footer}</p>}
    </div>
  );
}

function Working({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4" role="status">
      <p className="!mb-3 inline-flex items-center gap-2 text-[14px] font-medium text-blue-900">
        <Dot tone="live" /> {text}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full w-1/3 animate-[connector-progress_1.4s_ease-in-out_infinite] rounded-full bg-blue-500" />
      </div>
      <style>{`@keyframes connector-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  const tone =
    notice.tone === "good"
      ? "bg-emerald-50 text-emerald-900 border-emerald-100"
      : notice.tone === "warn"
        ? "bg-amber-50 text-amber-900 border-amber-100"
        : "bg-blue-50 text-blue-900 border-blue-100";
  return (
    <p className={`!mb-0 rounded-xl border px-4 py-3 text-[13px] ${tone}`} role="status">
      {notice.text}
    </p>
  );
}

function RiskNote({ text }: { text: string }) {
  return (
    <p className="!mb-0 flex items-start gap-2 rounded-xl bg-slate-100/80 px-4 py-3 text-[12px] leading-relaxed text-slate-600">
      <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-600" />
      {text}
    </p>
  );
}

function Dot({ tone }: { tone: "idle" | "live" | "good" | "warn" }) {
  const color = {
    idle: "bg-slate-300",
    live: "bg-blue-500",
    good: "bg-emerald-500",
    warn: "bg-amber-500",
  }[tone];
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {(tone === "live" || tone === "good") && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${color} ${tone === "live" ? "animate-ping" : "animate-pulse"}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function StatusPill({ status, label }: { status: ConnectorStatus; label: string }) {
  const tone = statusCopy[status].tone;
  const style = {
    idle: "bg-slate-100 text-slate-500",
    live: "bg-blue-50 text-blue-700",
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-800",
  }[tone];
  return (
    <span
      className={`hidden shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-medium sm:inline-flex ${style}`}
    >
      <Dot tone={tone} />
      {label}
    </span>
  );
}

function SummaryChip({
  tone,
  value,
  label,
}: {
  tone: "good" | "warn";
  value: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600">
      <Dot tone={value ? tone : "idle"} />
      <span className="font-semibold tabular-nums text-slate-900">{value}</span> {label}
    </span>
  );
}

type Option<T extends string> =
  [T, string] | [T, string, typeof Globe] | [T, string, typeof Globe, boolean];
function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1">
      {options.map(([key, text, Icon, disabled]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          disabled={disabled}
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
            value === key
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {Icon && <Icon size={14} />}
          {text}
        </button>
      ))}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
  icon,
  type = "button",
  tone = "dark",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  type?: "button" | "submit";
  tone?: "dark" | "light";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium shadow-sm transition ${
        tone === "dark"
          ? "bg-slate-900 text-white hover:bg-slate-800"
          : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
      }`}
    >
      {busy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  busy,
  icon,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
        tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {busy ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
