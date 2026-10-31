import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrowserWorkspaceProvider, useBrowserScope } from "@/components/workspace/BrowserDock";
let authCallback: (event: string, session: unknown) => void;
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
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ configured: false, handoffEnabled: false })),
  ),
);
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
    fireEvent.click(await screen.findByRole("button", { name: /Steward browser/ }));
    expect(await screen.findByText("Live browser setup is not complete yet.")).toBeInTheDocument();
    view.rerender(
      <BrowserWorkspaceProvider>
        <Page key="events" name="Gatherings" />
      </BrowserWorkspaceProvider>,
    );
    expect(screen.getByLabelText("Community Steward live browser")).toBeInTheDocument();
    expect(screen.getByText("Gatherings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take control" })).toBeDisabled();
  });
  it("clears the old workspace panel when switching organizations", async () => {
    const view = render(
      <BrowserWorkspaceProvider>
        <Page name="Dashboard" />
      </BrowserWorkspaceProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Steward browser/ }));
    view.rerender(
      <BrowserWorkspaceProvider>
        <Page name="Dashboard" organizationId="org-b" />
      </BrowserWorkspaceProvider>,
    );
    expect(screen.queryByLabelText("Community Steward live browser")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Steward browser/ })).toBeInTheDocument();
  });
});
