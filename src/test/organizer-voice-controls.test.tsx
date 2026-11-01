import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ end: vi.fn(async () => {}), start: vi.fn(), organizationId: "11111111-1111-4111-8111-111111111111", db: { auth: { getSession: async () => ({ data: { session: { access_token: "fixture-token" } } }) } } }));
vi.mock("@/components/workspace/WorkspaceGate", () => ({ useWorkspace: () => ({ role: "owner", organizationId: mocks.organizationId, db: mocks.db }) }));
vi.mock("@elevenlabs/client", () => ({ Conversation: { startSession: mocks.start } }));
import { OrganizerVoice } from "@/components/workspace/OrganizerVoice";
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function setupFetch(configured = true) {
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    return Response.json({ configured, reason: "Voice demo disabled — agent not configured.", ...(body.action === "start" ? { conversationToken: "fixture-conversation-token", organizationId: body.organizationId, thread: body.thread } : {}) });
  }));
}
it("does not access the microphone or start a session before explicit Start", async () => {
  setupFetch(); render(<OrganizerVoice thread="main" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start voice" })).toBeEnabled());
  expect(mocks.start).not.toHaveBeenCalled();
  expect(vi.mocked(fetch).mock.calls.map(call => JSON.parse(String(call[1]?.body)).action)).toEqual(["status"]);
});
it("never starts unavailable demo voice", async () => {
  setupFetch(false); render(<OrganizerVoice thread="main" />);
  await screen.findByText(/Voice demo disabled — agent/);
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  expect(mocks.start).not.toHaveBeenCalled();
});
it("clears transcripts and disconnects on thread and organization switch", async () => {
  setupFetch();
  mocks.start.mockImplementation(async options => { options.onMessage({ source: "user", message: "Prepare a gathering draft" }); return { endSession: mocks.end }; });
  const view = render(<OrganizerVoice thread="main" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start voice" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  await screen.findByText("Prepare a gathering draft");
  fireEvent.click(screen.getByRole("button", { name: "Clear transcript" }));
  expect(screen.queryByText("Prepare a gathering draft")).not.toBeInTheDocument();
  view.rerender(<OrganizerVoice thread="venue" />);
  expect(mocks.end).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start voice" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  await screen.findByText("Prepare a gathering draft");
  mocks.organizationId = "22222222-2222-4222-8222-222222222222";
  view.rerender(<OrganizerVoice thread="venue" />);
  expect(mocks.end).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Prepare a gathering draft")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Start voice" })).toBeEnabled());
});
it("stops and closes the active voice session", async () => {
  setupFetch(); mocks.start.mockResolvedValue({ endSession: mocks.end });
  render(<OrganizerVoice thread="main" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start voice" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  await screen.findByText("Live voice · preparation only");
  fireEvent.click(screen.getByRole("button", { name: "Stop voice" }));
  expect(mocks.end).toHaveBeenCalledTimes(1);
});it("does not restore a session that disconnected while starting", async () => {
  setupFetch();
  mocks.start.mockImplementation(async options => {
    options.onDisconnect();
    return { endSession: mocks.end };
  });
  render(<OrganizerVoice thread="main" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start voice" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start voice" }));
  await screen.findByText("Voice disconnected");
  await waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Live voice · preparation only")).not.toBeInTheDocument();
});
