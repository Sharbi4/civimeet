import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlatformAgent } from "@/lib/vendors";
const state = vi.hoisted(() => ({ eq: vi.fn() }));
vi.mock("@/components/workspace/WorkspaceGate", () => {
  const chain = {
    select: () => chain,
    eq: (key: string, value: string) => {
      state.eq(key, value);
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  const db = {
    from: () => chain,
    auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) },
  };
  return { useWorkspace: () => ({ db, organizationId: "org-a", role: "owner" }) };
});
import { PlatformConversation } from "@/components/workspace/PlatformConversation";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads and sends within the selected organization and platform conversation", async () => {
  const send = vi.fn().mockResolvedValue(Response.json({ run: { status: "completed" } }));
  vi.stubGlobal("fetch", send);
  render(
    <PlatformConversation
      agent={
        {
          id: "facebook-agent",
          platform: "facebook",
          name: "Facebook agent",
          selected: true,
          paused: false,
        } as PlatformAgent
      }
    />,
  );
  expect(state.eq).toHaveBeenCalledWith("organization_id", "org-a");
  expect(state.eq).toHaveBeenCalledWith("input->>agentId", "facebook-agent");
  fireEvent.change(screen.getByLabelText("Guide your agent"), {
    target: { value: "Draft a useful community update." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send to agent" }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(JSON.parse(send.mock.calls[0]![1].body)).toMatchObject({
    organizationId: "org-a",
    agentId: "facebook-agent",
    question: "Draft a useful community update.",
  });
});
