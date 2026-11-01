import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "owner" }));
vi.mock("@/components/workspace/OrganizerVoice", () => ({ OrganizerVoice: () => null }));
vi.mock("@/components/workspace/WorkspaceGate", () => {
  const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: { area: "Tucson" } }) };
  const db = { from: () => query, auth: { getSession: async () => ({ data: { session: { access_token: "fixture" } } }) } };
  return { useWorkspace: () => ({ db, organizationId: "org-fixture", role: state.role }) };
});
import { OrganizerChat } from "@/components/workspace/OrganizerChat";
beforeEach(() => { state.role = "owner"; vi.stubGlobal("fetch", vi.fn(async () => Response.json({run:{status:"completed"}}))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("runs a scoped presence job only when requested, with shared knowledge enabled", async () => {
  render(<OrganizerChat thread="main" onDraft={vi.fn()} />);
  await screen.findByText("Start with what your community needs.");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Build our community presence" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/research");
  expect(JSON.parse(String(init?.body))).toMatchObject({organizationId:"org-fixture",skillId:"community_presence",includeKnowledge:true,threadKey:"main"});
  await waitFor(() => expect(screen.getByRole("button", { name: "Build our community presence" })).toBeEnabled());
});
it("does not allow a viewer to start agent work", async () => {
  state.role = "viewer";
  render(<OrganizerChat thread="main" onDraft={vi.fn()} />);
  await screen.findByText("Start with what your community needs.");
  const start=screen.getByRole("button", { name: "Build our community presence" });
  expect(start).toBeDisabled();
  fireEvent.click(start);
  expect(fetch).not.toHaveBeenCalled();
});
