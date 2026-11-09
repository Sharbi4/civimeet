import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Full chat-to-browser workflow in the dashboard: the real chat, action executor and agent
// panel, with only the server endpoints and database mocked.
const state = vi.hoisted(() => ({
  role: "owner",
  connection: "not_connected" as string,
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  connectorCalls: [] as Record<string, unknown>[],
  connectorReply: null as
    null | ((body: Record<string, unknown>) => { status: number; body: unknown }),
}));
vi.mock("@/components/workspace/OrganizerVoice", () => ({ OrganizerVoice: () => null }));
vi.mock("@/components/workspace/BrowserDock", () => ({
  PlatformBrowser: () => <p>Web agent browser</p>,
  requestAgentBrowse: () => {},
}));
vi.mock("@/components/workspace/WorkspaceGate", () => {
  const builder = (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "in", "lt", "neq"])
      query[method] = () => query;
    const rows: Record<string, unknown> = {
      organization_briefs: { area: "Tucson" },
      organization_connectors: { status: state.connection },
      platform_agents: null,
    };
    query["maybeSingle"] = async () => ({ data: rows[table] ?? null });
    query["single"] = async () => ({ data: rows[table] ?? null });
    query["then"] = (resolve: (value: unknown) => void) => resolve({ data: [] });
    return query;
  };
  const db = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args });
      return {
        data: name === "log_chat_action" ? `action-${state.rpc.length}` : null,
        error: null,
      };
    },
    auth: { getSession: async () => ({ data: { session: { access_token: "fixture" } } }) },
  };
  return { useWorkspace: () => ({ db, organizationId: "org-fixture", role: state.role }) };
});
import { useWorkspace } from "@/components/workspace/WorkspaceGate";
import { ChatActionsProvider } from "@/components/workspace/ChatActions";
import { OrganizerChat } from "@/components/workspace/OrganizerChat";
import { AgentPanel } from "@/components/workspace/AgentPanel";

const viewer = "https://api.steel.dev/v1/sessions/33333333-3333-4333-8333-333333333333/player";
function Dashboard() {
  const { db, role } = useWorkspace();
  return (
    <ChatActionsProvider
      workspace={{
        db,
        organizationId: "org-fixture",
        role,
        demo: false,
        approvalsPending: 2,
        navigate: vi.fn(),
        openChatThread: vi.fn(),
      }}
    >
      <OrganizerChat thread="main" onDraft={vi.fn()} />
      <AgentPanel
        demo={false}
        label="Main Agent"
        approvals={[]}
        activity={[]}
        mainMemory={[]}
        admin={role === "owner"}
        webAgentId={null}
        onReview={vi.fn()}
        onEdit={vi.fn()}
        onOpenConnections={vi.fn()}
        onClose={vi.fn()}
      />
    </ChatActionsProvider>
  );
}
const updates = () =>
  state.rpc.filter((call) => call.name === "update_chat_action").map((call) => call.args);
async function say(text: string) {
  render(<Dashboard />);
  await screen.findByText("Start with what your community needs.");
  const box = screen.getByLabelText("Message your organizer");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}
beforeEach(() => {
  state.role = "owner";
  state.connection = "not_connected";
  state.rpc = [];
  state.connectorCalls = [];
  state.connectorReply = (body) =>
    body["command"] === "browser_finish"
      ? { status: 200, body: { status: "connected" } }
      : {
          status: 200,
          body: {
            status: "awaiting_sign_in",
            viewer,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
        };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/connectors") {
        const body = JSON.parse(String(init?.body));
        state.connectorCalls.push(body);
        const reply = state.connectorReply!(body);
        return Response.json(reply.body, { status: reply.status });
      }
      return Response.json({ run: { status: "completed" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("opens Facebook sign-in in the panel from chat and reports success only after the server confirms", async () => {
  await say("Start browser and login to Facebook.");
  await waitFor(() =>
    expect(state.connectorCalls).toEqual([
      { organizationId: "org-fixture", command: "browser_start", connector: "facebook" },
    ]),
  );
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/research")).toBe(false);
  expect(state.rpc.find((call) => call.name === "log_chat_action")?.args).toMatchObject({
    chat_action: { type: "connect_platform", platform: "facebook" },
    outcome: "started",
  });
  await waitFor(() => expect(updates().at(-1)).toMatchObject({ outcome: "needs_user" }));
  expect(String(updates().at(-1)!["outcome_reply"])).toContain("never see your password");
  // The live browser appears in the agent panel without visiting Connections.
  const frame = await screen.findByTitle("Facebook sign-in in the agent browser");
  expect(frame).toHaveAttribute("src", viewer);
  expect(updates().some((args) => args["outcome"] === "succeeded")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "I’m signed in" }));
  await waitFor(() =>
    expect(state.connectorCalls.at(-1)).toMatchObject({
      command: "browser_finish",
      connector: "facebook",
    }),
  );
  await waitFor(() =>
    expect(updates().at(-1)).toMatchObject({
      outcome: "succeeded",
      outcome_reply:
        "You're connected to Facebook. Want me to look for local communities related to your mission on Facebook?",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByTitle("Facebook sign-in in the agent browser")).not.toBeInTheDocument(),
  );
});

it("does not claim success while Facebook still shows its sign-in page", async () => {
  state.connectorReply = (body) =>
    body["command"] === "browser_finish"
      ? {
          status: 200,
          body: { status: "awaiting_sign_in", message: "Facebook still shows its sign-in page." },
        }
      : {
          status: 200,
          body: {
            status: "awaiting_sign_in",
            viewer,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
        };
  await say("Open Facebook and let me log in.");
  fireEvent.click(await screen.findByRole("button", { name: "I’m signed in" }));
  await waitFor(() =>
    expect(updates().at(-1)).toMatchObject({
      outcome: "needs_user",
      outcome_reply: "Facebook still shows its sign-in page.",
    }),
  );
  expect(screen.getByTitle("Facebook sign-in in the agent browser")).toBeInTheDocument();
});

it("keeps the goal and offers to continue it after sign-in", async () => {
  await say("Log in to Facebook and find local groups for single parents");
  await waitFor(() =>
    expect(state.rpc.find((call) => call.name === "log_chat_action")?.args["goal"]).toBe(
      "find local groups for single parents",
    ),
  );
  fireEvent.click(await screen.findByRole("button", { name: "I’m signed in" }));
  await waitFor(() =>
    expect(updates().at(-1)?.["outcome_reply"]).toBe(
      "You're connected to Facebook. Want me to find local groups for single parents?",
    ),
  );
});

it("opens the existing session instead of signing in again when already connected", async () => {
  state.connection = "connected";
  state.connectorReply = () => ({
    status: 200,
    body: { status: "connected", viewer, expiresAt: new Date(Date.now() + 300_000).toISOString() },
  });
  await say("Open Facebook");
  await waitFor(() =>
    expect(state.connectorCalls[0]).toMatchObject({
      command: "browser_open",
      connector: "facebook",
    }),
  );
  expect(await screen.findByRole("button", { name: "Give back to agent" })).toBeInTheDocument();
  await waitFor(() => expect(updates().at(-1)).toMatchObject({ outcome: "succeeded" }));
});

it("denies people who can't manage connections without calling the browser", async () => {
  state.role = "organizer";
  await say("Connect my LinkedIn");
  await waitFor(() => expect(updates().at(-1)).toMatchObject({ outcome: "failed" }));
  expect(String(updates().at(-1)!["outcome_reply"])).toContain(
    "Only an organization owner or administrator",
  );
  expect(state.connectorCalls).toEqual([]);
});

it("reports the real failure with a way to recover", async () => {
  state.connectorReply = () => ({
    status: 409,
    body: { error: "The agent browser is not configured on this deployment yet (Steel API key)." },
  });
  await say("Open Instagram");
  await waitFor(() => expect(updates().at(-1)).toMatchObject({ outcome: "failed" }));
  expect(String(updates().at(-1)!["outcome_reply"])).toBe(
    "The agent browser is not configured on this deployment yet (Steel API key). You can try again, or use Connections.",
  );
});

it("opens approvals and still sends real research questions to research", async () => {
  await say("Show my pending approvals.");
  await waitFor(() =>
    expect(updates().at(-1)).toMatchObject({
      outcome: "succeeded",
      outcome_reply: "You have 2 items waiting for approval. They're open in the panel.",
    }),
  );
  cleanup();
  await say("What are single parents in Tucson asking for help with?");
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/research")).toBe(true),
  );
});
