import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrowserWorkspaceProvider, useBrowserScope } from "@/components/workspace/BrowserDock";
let authCallback: (event: string, session: unknown) => void;
let workspaceRows: unknown[] = [];
const db = {
  auth: {
    onAuthStateChange: (callback: typeof authCallback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "platform_agents"
              ? [
                  {
                    id: "web-agent",
                    name: "Resource Steward",
                    platform: "web",
                    selected: true,
                    paused: false,
                  },
                ]
              : table === "browser_workspaces"
                ? workspaceRows
                : [],
          error: null,
        }).then(resolve),
    };
    return chain;
  },
} as unknown as SupabaseClient;
function Page({ name, organizationId = "org-a" }: { name: string; organizationId?: string }) {
  useBrowserScope({ db, organizationId, name: organizationId, userId: "user", role: "owner" });
  return <p>{name}</p>;
}
beforeEach(() => {
  workspaceRows = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ configured: false, handoffEnabled: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("global browser dock", () => {
  it("retains its open layout across workspace page changes", async () => {
    const view = render(
      <BrowserWorkspaceProvider>
        <Page key="dashboard" name="Dashboard" />
      </BrowserWorkspaceProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Community action agent/ }));
    expect(await screen.findByText("Live browser setup is not complete yet.")).toBeInTheDocument();
    view.rerender(
      <BrowserWorkspaceProvider>
        <Page key="events" name="Gatherings" />
      </BrowserWorkspaceProvider>,
    );
    expect(screen.getByLabelText("Community action agent browser")).toBeInTheDocument();
    expect(screen.getByText("Gatherings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take control" })).not.toBeInTheDocument();
  });
  it("clears the old workspace panel when switching organizations", async () => {
    const view = render(
      <BrowserWorkspaceProvider>
        <Page name="Dashboard" />
      </BrowserWorkspaceProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Community action agent/ }));
    view.rerender(
      <BrowserWorkspaceProvider>
        <Page name="Dashboard" organizationId="org-b" />
      </BrowserWorkspaceProvider>,
    );
    expect(screen.queryByLabelText("Community action agent browser")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Community action agent/ }),
    ).toBeInTheDocument();
  });
  it.each([
    ["ready", null, "Pause", "Take control"],
    ["authentication_required", null, "Take control", "Return control to agent"],
    ["human_controlling", "user", "Return control to agent", "Take control"],
    ["paused", null, "Resume task", "Pause"],
    ["failed", null, "Stop task", "Start task"],
  ])("shows the next action for %s", async (state, human_actor, shown, hidden) => {
    workspaceRows = [
      {
        id: "session",
        agent_id: "web-agent",
        state,
        human_actor,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(Response.json({ configured: true, handoffEnabled: true }));
    render(
      <BrowserWorkspaceProvider>
        <Page name="Dashboard" />
      </BrowserWorkspaceProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Community action agent/ }));
    expect(await screen.findByRole("button", { name: shown! })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: hidden! })).not.toBeInTheDocument();
  });
});
