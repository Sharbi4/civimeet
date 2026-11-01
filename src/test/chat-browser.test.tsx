import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentRun, LiveSession } from "@/components/workspace/ChatActions";

const actions = {
  run: vi.fn(async () => {}),
  agentRun: null as AgentRun | null,
  controlRun: vi.fn(async () => {}),
  liveSession: null as LiveSession | null,
  finishSignIn: vi.fn(async () => {}),
  closeSession: vi.fn(async () => {}),
  sessionExpired: vi.fn(async () => {}),
  busy: null as string | null,
  version: 0,
  demoActions: [],
};
vi.mock("@/components/workspace/ChatActions", () => ({ useChatActions: () => actions }));
const { ChatBrowser } = await import("@/components/workspace/ChatBrowser");

const viewer =
  "https://api.steel.dev/v1/sessions/33333333-3333-4333-8333-333333333333/player/opaque";
beforeEach(() => {
  actions.liveSession = null;
  actions.agentRun = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

it("puts the accounts the agent can open on the chat screen and opens them through chat actions", async () => {
  render(
    <ChatBrowser thread="main" demo={false} admin connected={["facebook"]} webAgentId={null} />,
  );
  const browser = screen.getByRole("region", { name: "Agent browser" });
  expect(within(browser).getByRole("button", { name: /^Facebook.*Signed in/ })).toBeEnabled();
  expect(within(browser).getByRole("button", { name: /^Instagram.*Sign in/ })).toBeEnabled();
  fireEvent.click(within(browser).getByRole("button", { name: /^Facebook/ }));
  expect(actions.run).toHaveBeenCalledWith(
    { type: "connect_platform", platform: "facebook" },
    "Open Facebook",
    "main",
  );
});

it("shows the live sign-in browser itself, with the person's controls", () => {
  actions.liveSession = {
    connector: "facebook",
    name: "Facebook",
    viewer,
    expiresAt: new Date(Date.now() + 240_000).toISOString(),
    mode: "sign_in",
    actionId: "a1",
    goal: "",
  };
  render(<ChatBrowser thread="main" demo={false} admin connected={[]} webAgentId={null} />);
  const frame = screen.getByTitle("Facebook sign-in in the agent browser");
  expect(frame).toHaveAttribute("src", viewer);
  fireEvent.click(screen.getByRole("button", { name: "I’m signed in" }));
  expect(actions.finishSignIn).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Hide browser" }));
  expect(screen.queryByTitle("Facebook sign-in in the agent browser")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show browser" }));
  expect(screen.getByTitle("Facebook sign-in in the agent browser")).toBeInTheDocument();
});

it("keeps account buttons off for people who can't connect accounts", () => {
  render(
    <ChatBrowser
      thread="platform_facebook"
      connector="facebook"
      demo={false}
      admin={false}
      connected={[]}
      webAgentId={null}
    />,
  );
  const browser = screen.getByRole("region", { name: "Agent browser" });
  expect(within(browser).getAllByRole("button", { name: /Sign in/ })).toHaveLength(1);
  expect(within(browser).getByRole("button", { name: /^Facebook/ })).toBeDisabled();
  expect(within(browser).getByText(/Only an organization owner or administrator/)).toBeVisible();
});
