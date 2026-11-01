import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connectorRequest } from "./Connectors";
import { usePlans } from "./AgentPlans";
import { getConnector } from "@/lib/connectors";
import type { ChatIntent } from "@/lib/chat-intents";

// Carries out instructions from chat with the app's real tools. Every action is recorded with
// its true outcome; success is reported only after the backend confirms it.
export type LiveSession = {
  connector: string;
  name: string;
  viewer: string;
  expiresAt: string;
  mode: "sign_in" | "control";
  actionId: string | null;
  goal: string;
};
export type PanelTab = "activity" | "approvals" | "browser" | "memory";
export type ChatActionRecord = {
  id: string;
  thread_key: string;
  message: string;
  action: ChatIntent & { source?: "civi" };
  status: "started" | "needs_user" | "succeeded" | "failed";
  reply: string;
  resume_goal: string;
  created_at: string;
};
type Workspace = {
  db: SupabaseClient | null;
  organizationId: string | null;
  role: string;
  demo: boolean;
  approvalsPending: number;
  navigate: (view: "connectors" | "approvals") => void;
  openChatThread: (thread: string) => void;
};
/** A computer-use run in the agent's browser, as the dashboard shows it. */
export type AgentRun = {
  id: string;
  platform: string;
  name: string;
  objective: string;
  status: "running" | "waiting_for_human" | "paused" | "succeeded" | "failed" | "cancelled";
  detail: string;
  currentAction: string;
  url: string;
  screenshot: string | null;
  viewer: string | null;
  safetyChecks: { id: string; code: string | null; message: string | null }[];
  /** What the agent wants to do while Meta waits for a person, with Civi's own verdict. */
  proposed: { summary: string; allowed: boolean; reason?: string }[];
  events: { id: string; kind: string; summary: string; created_at: string }[];
  actionId: string | null;
  result: { summary?: string; url?: string; title?: string } | null;
};
type RunCommand =
  "pause" | "resume" | "stop" | "takeover" | "release" | "approve_safety" | "decline_safety";
type ChatActionsValue = {
  run: (intent: ChatIntent, message: string, thread: string, source?: "civi") => Promise<void>;
  agentRun: AgentRun | null;
  controlRun: (command: RunCommand) => Promise<void>;
  liveSession: LiveSession | null;
  finishSignIn: () => Promise<void>;
  closeSession: () => Promise<void>;
  sessionExpired: () => Promise<void>;
  busy: string | null;
  version: number;
  demoActions: ChatActionRecord[];
};
const ChatActionsContext = createContext<ChatActionsValue | null>(null);
export const useChatActions = () => useContext(ChatActionsContext);

/** Bring the agent panel into view on a tab (the workspace and panel both listen). */
export function openAgentPanel(tab: PanelTab) {
  window.dispatchEvent(new CustomEvent("civimeet:panel", { detail: { tab } }));
}

const isAdmin = (role: string) => role === "owner" || role === "admin";
const nameOf = (id: string) => getConnector(id)?.name ?? id;
const nextStep = (goal: string, name: string) =>
  goal
    ? `Want me to ${goal.replace(/^(?:to\s+)?/i, "")}?`
    : `Want me to look for local communities related to your mission on ${name}?`;

export function ChatActionsProvider({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace: Workspace;
}) {
  const { db, organizationId, role, demo, approvalsPending, navigate, openChatThread } = workspace;
  const plans = usePlans();
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [demoActions, setDemoActions] = useState<ChatActionRecord[]>([]);
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const stepping = useRef(false);

  const log = useCallback(
    async (
      thread: string,
      message: string,
      action: ChatIntent & { source?: "civi" },
      goal = "",
    ) => {
      if (demo || !db || !organizationId) {
        const id = crypto.randomUUID();
        setDemoActions((current) => [
          ...current,
          {
            id,
            thread_key: thread,
            message,
            action,
            status: "started",
            reply: "",
            resume_goal: goal,
            created_at: new Date().toISOString(),
          },
        ]);
        return id;
      }
      const { data, error } = await db.rpc("log_chat_action", {
        workspace: organizationId,
        thread,
        chat_message: message,
        chat_action: action,
        outcome: "started",
        outcome_reply: "",
        goal,
      });
      if (error) throw new Error("Your instruction couldn't be recorded. Try again.");
      setVersion((value) => value + 1);
      return String(data);
    },
    [db, organizationId, demo],
  );
  const settle = useCallback(
    async (id: string | null, status: ChatActionRecord["status"], reply: string) => {
      if (!id) return;
      if (demo || !db)
        setDemoActions((current) =>
          current.map((item) => (item.id === id ? { ...item, status, reply } : item)),
        );
      else
        await db.rpc("update_chat_action", { target: id, outcome: status, outcome_reply: reply });
      setVersion((value) => value + 1);
    },
    [db, demo],
  );
  const request = useCallback(
    (body: Parameters<typeof connectorRequest>[2]) => {
      if (!db || !organizationId) throw new Error("Sign in to your organization first.");
      return connectorRequest(db, organizationId, body);
    },
    [db, organizationId],
  );

  const connect = useCallback(
    async (actionId: string, platform: string, goal: string) => {
      const definition = getConnector(platform);
      if (!definition || definition.comingSoon)
        return settle(
          actionId,
          "failed",
          `I can't connect ${definition?.name ?? "that platform"} yet. You can see what's available in Connections.`,
        );
      const name = definition.name;
      if (demo)
        return settle(
          actionId,
          "succeeded",
          `This is the sample workspace, so no real browser opens here. In your workspace, I'd open ${name} in your secure agent browser for you to sign in.`,
        );
      if (!isAdmin(role))
        return settle(
          actionId,
          "failed",
          `Only an organization owner or administrator can connect ${name}. Ask one of them to say “open ${name}” here, or to connect it in Connections.`,
        );
      const { data: row } = await db!
        .from("organization_connectors")
        .select("status")
        .eq("organization_id", organizationId!)
        .eq("connector", platform)
        .maybeSingle();
      const connected = row?.status === "connected";
      const browser =
        definition.methods.includes("browser") || definition.methods.includes("credentials");
      try {
        if (browser && (connected || definition.methods.includes("browser"))) {
          const result = await request({
            command: connected ? "browser_open" : "browser_start",
            connector: platform,
          });
          if (!result.viewer || !result.expiresAt)
            throw new Error(`${name} didn't open. Try again in a moment.`);
          setLiveSession({
            connector: platform,
            name,
            viewer: result.viewer,
            expiresAt: result.expiresAt,
            mode: connected ? "control" : "sign_in",
            actionId,
            goal,
          });
          openAgentPanel("browser");
          return settle(
            actionId,
            connected ? "succeeded" : "needs_user",
            connected
              ? `${name} is open in your secure agent browser, already signed in. You're in control; give it back when you're done.`
              : `I've opened ${name} in your secure browser. Sign in there yourself (two-factor too), then tap “I’m signed in”. I never see your password.`,
          );
        }
        if (definition.oauth) {
          const result = await request({ command: "oauth_start", connector: platform });
          if (!result.redirect) throw new Error(`${name} sign-in didn't start. Try again.`);
          await settle(
            actionId,
            "needs_user",
            `Taking you to ${name} to approve access. You'll come back to Connections when it's done.`,
          );
          window.location.assign(result.redirect);
          return;
        }
        return settle(
          actionId,
          "failed",
          `${name} can't be connected from here yet. Open Connections to see the options.`,
        );
      } catch (failure) {
        return settle(
          actionId,
          "failed",
          `${failure instanceof Error ? failure.message : `${name} couldn't open.`} You can try again, or use Connections.`,
        );
      }
    },
    [demo, role, db, organizationId, request, settle],
  );

  const agentBrowser = useCallback(
    async (body: Record<string, unknown>) => {
      if (!db || !organizationId) throw new Error("Sign in to your organization first.");
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Sign in again to use the agent browser.");
      const response = await fetch("/api/agent/browser", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId, ...body }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "The agent browser couldn't run that step.");
      return payload;
    },
    [db, organizationId],
  );

  const browse = useCallback(
    async (actionId: string, platform: string, objective: string) => {
      const name = nameOf(platform);
      if (demo)
        return settle(
          actionId,
          "succeeded",
          `This is the sample workspace, so no real browser runs here. In your workspace, the ${name} agent would open your account in its secure browser, look around read-only, and tell you what it found.`,
        );
      if (!isAdmin(role))
        return settle(
          actionId,
          "failed",
          `Only an organization owner or administrator can send the ${name} agent into the browser.`,
        );
      try {
        const started = await agentBrowser({
          command: "start",
          platform,
          objective,
          chatActionId: actionId,
        });
        setAgentRun({
          id: String(started["runId"]),
          platform,
          name,
          objective,
          status: "running",
          detail: "",
          currentAction: "Opening the browser",
          url: "",
          screenshot: null,
          viewer: null,
          safetyChecks: [],
          proposed: [],
          events: [],
          actionId,
          result: null,
        });
        openAgentPanel("browser");
        return settle(
          actionId,
          "started",
          `On it. The ${name} agent is opening your account and looking now (read-only).`,
        );
      } catch (failure) {
        return settle(
          actionId,
          "failed",
          failure instanceof Error ? failure.message : `The ${name} agent couldn't start.`,
        );
      }
    },
    [demo, role, agentBrowser, settle],
  );

  // Advance the run one verified step at a time while it is running.
  const loadEvents = useCallback(
    async (runId: string) => {
      if (!db) return [];
      const { data } = await db
        .from("browser_agent_events")
        .select("id,kind,summary,created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as AgentRun["events"];
    },
    [db],
  );
  const applyStep = useCallback(
    async (current: AgentRun, payload: Record<string, unknown>) => {
      const status = (payload["status"] as AgentRun["status"]) ?? current.status;
      const next: AgentRun = {
        ...current,
        status,
        detail: String(payload["detail"] ?? (status === "running" ? "" : current.detail)),
        currentAction: String(
          payload["currentAction"] ?? (status === "running" ? current.currentAction : ""),
        ),
        url: String(payload["url"] ?? current.url),
        screenshot:
          typeof payload["screenshot"] === "string"
            ? (payload["screenshot"] as string)
            : current.screenshot,
        viewer:
          typeof payload["viewer"] === "string"
            ? (payload["viewer"] as string)
            : status === "running"
              ? null
              : current.viewer,
        safetyChecks: Array.isArray(payload["safetyChecks"])
          ? (payload["safetyChecks"] as AgentRun["safetyChecks"])
          : status === "running"
            ? []
            : current.safetyChecks,
        proposed: Array.isArray(payload["proposed"])
          ? (payload["proposed"] as AgentRun["proposed"])
          : status === "running"
            ? []
            : current.proposed,
        result: (payload["result"] as AgentRun["result"]) ?? current.result,
        events: await loadEvents(current.id),
      };
      setAgentRun(next);
      if (status === "succeeded")
        await settle(
          current.actionId,
          "succeeded",
          `Here's what I saw on ${current.name} (read-only): ${next.result?.summary ?? "Done."}`,
        );
      else if (status === "failed")
        await settle(
          current.actionId,
          "failed",
          next.detail || `The ${current.name} agent couldn't finish.`,
        );
      else if (status === "cancelled")
        await settle(current.actionId, "failed", next.detail || "Stopped.");
      else if (status === "waiting_for_human" && current.status !== "waiting_for_human")
        await settle(
          current.actionId,
          "needs_user",
          next.detail || `The ${current.name} agent needs you in the browser.`,
        );
    },
    [loadEvents, settle],
  );
  useEffect(() => {
    if (!agentRun || agentRun.status !== "running" || stepping.current) return;
    stepping.current = true;
    const current = agentRun;
    void agentBrowser({ command: "step", runId: current.id })
      .then((payload) => applyStep(current, payload))
      .catch(async (failure: unknown) => {
        const message = failure instanceof Error ? failure.message : "The browser step failed.";
        // A step still in progress elsewhere is not a failure; check again shortly.
        if (/still working/i.test(message))
          await new Promise((resolve) => setTimeout(resolve, 3000));
        else await applyStep(current, { status: "failed", detail: message });
      })
      .finally(() => {
        stepping.current = false;
        setAgentRun((latest) => (latest && latest.id === current.id ? { ...latest } : latest));
      });
  }, [agentRun, agentBrowser, applyStep]);
  const controlRun = useCallback(
    async (command: RunCommand) => {
      if (!agentRun) return;
      setBusy(command);
      try {
        const payload = await agentBrowser({ command, runId: agentRun.id });
        await applyStep(agentRun, payload);
      } catch (failure) {
        setAgentRun({
          ...agentRun,
          detail: failure instanceof Error ? failure.message : "That didn't work.",
        });
      } finally {
        setBusy(null);
      }
    },
    [agentRun, agentBrowser, applyStep],
  );

  const run = useCallback(
    async (intent: ChatIntent, message: string, thread: string, source?: "civi") => {
      const goal = intent.type === "connect_platform" ? (intent.goal ?? "") : "";
      setBusy(intent.type);
      let actionId: string | null = null;
      try {
        actionId = await log(thread, message, source ? { ...intent, source } : intent, goal);
        if (intent.type === "connect_platform")
          return await connect(actionId, intent.platform, goal);
        if (intent.type === "open_browser") {
          if (intent.platform) return await connect(actionId, intent.platform, "");
          openAgentPanel("browser");
          return await settle(actionId, "succeeded", "Here's the agent browser, in the panel.");
        }
        if (intent.type === "show_approvals") {
          openAgentPanel("approvals");
          return await settle(
            actionId,
            "succeeded",
            approvalsPending
              ? `You have ${approvalsPending} ${approvalsPending === 1 ? "item" : "items"} waiting for approval. They're open in the panel.`
              : "Nothing is waiting for your approval right now.",
          );
        }
        if (intent.type === "show_connections") {
          navigate("connectors");
          return await settle(actionId, "succeeded", "Opening Connections.");
        }
        if (intent.type === "show_agent") {
          const name = nameOf(intent.platform);
          const { data: row } =
            db && organizationId && !demo
              ? await db
                  .from("organization_connectors")
                  .select("status")
                  .eq("organization_id", organizationId)
                  .eq("connector", intent.platform)
                  .maybeSingle()
              : {
                  data: {
                    status: demo && intent.platform === "facebook" ? "connected" : "not_connected",
                  },
                };
          if (row?.status !== "connected")
            return await settle(
              actionId,
              "failed",
              `${name} isn't connected yet, so there's no ${name} agent working. Say “open ${name}” and I'll start the sign-in.`,
            );
          openChatThread(`platform_${intent.platform}`);
          openAgentPanel("activity");
          return await settle(actionId, "succeeded", `Here's what the ${name} agent is doing.`);
        }
        if (intent.type === "browse_task")
          return await browse(actionId, intent.platform, intent.objective);
        // pause_agent
        if (intent.platform === "all") {
          const active =
            plans?.plans.filter((plan) => plan.status === (intent.resume ? "paused" : "active")) ??
            [];
          for (const plan of active)
            await plans!.control(plan.id, intent.resume ? "resume" : "pause");
          return await settle(
            actionId,
            "succeeded",
            active.length
              ? `${intent.resume ? "Resumed" : "Paused"} ${active.length} ${active.length === 1 ? "plan" : "plans"}.`
              : `There's no ${intent.resume ? "paused" : "running"} plan right now.`,
          );
        }
        const name = nameOf(intent.platform);
        if (demo)
          return await settle(
            actionId,
            "succeeded",
            `In the sample workspace nothing is running, but in yours this ${intent.resume ? "resumes" : "pauses"} the ${name} agent.`,
          );
        if (!isAdmin(role))
          return await settle(
            actionId,
            "failed",
            `Only an organization owner or administrator can ${intent.resume ? "resume" : "pause"} the ${name} agent.`,
          );
        const { data: agent } = await db!
          .from("platform_agents")
          .select("id,name,instructions,paused")
          .eq("organization_id", organizationId!)
          .eq("platform", intent.platform)
          .maybeSingle();
        if (!agent) return await settle(actionId, "failed", `There's no ${name} agent set up yet.`);
        const { error } = await db!.rpc("configure_platform_agent", {
          target_agent: agent.id,
          agent_name: agent.name,
          agent_instructions: agent.instructions,
          is_paused: !intent.resume,
        });
        if (error) return await settle(actionId, "failed", error.message);
        return await settle(
          actionId,
          "succeeded",
          intent.resume
            ? `The ${name} agent is back on.`
            : `Paused the ${name} agent. It won't take any actions until you resume it.`,
        );
      } catch (failure) {
        await settle(
          actionId,
          "failed",
          failure instanceof Error ? failure.message : "That didn't work. Try again.",
        );
      } finally {
        setBusy(null);
      }
    },
    [
      log,
      connect,
      browse,
      settle,
      approvalsPending,
      navigate,
      openChatThread,
      db,
      organizationId,
      demo,
      plans,
      role,
    ],
  );

  const finishSignIn = useCallback(async () => {
    if (!liveSession) return;
    setBusy("finish");
    try {
      const result = await request({ command: "browser_finish", connector: liveSession.connector });
      if (result.status === "connected") {
        await settle(
          liveSession.actionId,
          "succeeded",
          `You're connected to ${liveSession.name}. ${nextStep(liveSession.goal, liveSession.name)}`,
        );
        setLiveSession(null);
      } else {
        await settle(
          liveSession.actionId,
          "needs_user",
          result.message ??
            `${liveSession.name} still shows its sign-in page. Finish signing in, then tap “I’m signed in”.`,
        );
      }
    } catch (failure) {
      await settle(
        liveSession.actionId,
        "needs_user",
        failure instanceof Error ? failure.message : "I couldn't check the sign-in. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }, [liveSession, request, settle]);

  const closeSession = useCallback(async () => {
    if (!liveSession) return;
    setBusy("close");
    try {
      await request({ command: "browser_cancel", connector: liveSession.connector });
    } catch {
      /* the window is closing either way */
    }
    await settle(
      liveSession.actionId,
      liveSession.mode === "control" ? "succeeded" : "failed",
      liveSession.mode === "control"
        ? `Gave ${liveSession.name} back to the agent.`
        : `Sign-in cancelled. Say “open ${liveSession.name}” whenever you want to try again.`,
    );
    setLiveSession(null);
    setBusy(null);
  }, [liveSession, request, settle]);

  const sessionExpired = useCallback(async () => {
    if (!liveSession) return;
    try {
      const result = await request({
        command: "browser_observe",
        connector: liveSession.connector,
      });
      if (result.viewer && result.expiresAt) {
        setLiveSession({ ...liveSession, viewer: result.viewer, expiresAt: result.expiresAt });
        return;
      }
    } catch {
      /* treat as expired */
    }
    await settle(
      liveSession.actionId,
      "failed",
      `The ${liveSession.name} window timed out. Say “open ${liveSession.name}” to start again.`,
    );
    setLiveSession(null);
  }, [liveSession, request, settle]);

  const value = useMemo<ChatActionsValue>(
    () => ({
      run,
      agentRun,
      controlRun,
      liveSession,
      finishSignIn,
      closeSession,
      sessionExpired,
      busy,
      version,
      demoActions,
    }),
    [
      run,
      agentRun,
      controlRun,
      liveSession,
      finishSignIn,
      closeSession,
      sessionExpired,
      busy,
      version,
      demoActions,
    ],
  );
  return <ChatActionsContext.Provider value={value}>{children}</ChatActionsContext.Provider>;
}
