import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "owner" }));
vi.mock("@/components/workspace/OrganizerVoice", () => ({ OrganizerVoice: () => null }));
vi.mock("@/components/workspace/WorkspaceGate", () => {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: [] }),
    maybeSingle: async () => ({ data: { area: "Tucson" } }),
  };
  const db = {
    from: () => query,
    auth: { getSession: async () => ({ data: { session: { access_token: "fixture" } } }) },
  };
  return { useWorkspace: () => ({ db, organizationId: "org-fixture", role: state.role }) };
});
import { OrganizerChat } from "@/components/workspace/OrganizerChat";
beforeEach(() => {
  state.role = "owner";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ run: { status: "completed" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("runs a scoped presence job only when requested, with shared knowledge enabled", async () => {
  render(<OrganizerChat thread="main" onDraft={vi.fn()} />);
  await screen.findByText("Start with what your community needs.");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Build our community presence" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe("/api/research");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    organizationId: "org-fixture",
    skillId: "community_presence",
    includeKnowledge: true,
    threadKey: "main",
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Build our community presence" })).toBeEnabled(),
  );
});
it("does not allow a viewer to start agent work", async () => {
  state.role = "viewer";
  render(<OrganizerChat thread="main" onDraft={vi.fn()} />);
  await screen.findByText("Start with what your community needs.");
  const start = screen.getByRole("button", { name: "Build our community presence" });
  expect(start).toBeDisabled();
  fireEvent.click(start);
  expect(fetch).not.toHaveBeenCalled();
});
it("sends short messages with Enter and shows them in the thread right away", async () => {
  let release: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
  );
  render(<OrganizerChat thread="main" onDraft={vi.fn()} />);
  await screen.findByText("Start with what your community needs.");
  const box = screen.getByLabelText("Message your organizer");
  fireEvent.change(box, { target: { value: "hi" } });
  // Regression: short messages used to be blocked by a 10-character minimum.
  expect(screen.getByRole("button", { name: "Send to organizer" })).toBeEnabled();
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(screen.getByText("hi")).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Civi is replying" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stop waiting" })).toBeInTheDocument();
  expect(box).toHaveValue("");
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body))).toMatchObject({
    question: "hi",
    skillId: "auto",
  });
  release(Response.json({ run: { status: "completed" } }));
});
it("keeps Shift+Enter for a new line", async () => {
  render(<OrganizerChat thread="main" onDraft={vi.fn()} />);
  await screen.findByText("Start with what your community needs.");
  const box = screen.getByLabelText("Message your organizer");
  fireEvent.change(box, { target: { value: "hello" } });
  fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
  expect(fetch).not.toHaveBeenCalled();
});
