import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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
type ChatActionsValue = {
  run: (intent: ChatIntent, message: string, thread: string, source?: "civi") => Promise<void>;
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
      liveSession,
      finishSignIn,
      closeSession,
      sessionExpired,
      busy,
      version,
      demoActions,
    }),
    [run, liveSession, finishSignIn, closeSession, sessionExpired, busy, version, demoActions],
  );
  return <ChatActionsContext.Provider value={value}>{children}</ChatActionsContext.Provider>;
}
