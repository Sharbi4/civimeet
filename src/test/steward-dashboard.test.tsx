import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "owner",
  rpc: vi.fn(),
  needs: [] as Record<string, unknown>[],
  plans: [] as Record<string, unknown>[],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/workspace/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => ({
    organizationId: "org-a",
    role: state.role,
    db: {
      rpc: state.rpc,
      auth: { getSession: async () => ({ data: { session: { access_token: "session-token" } } }) },
      from: (table: string) => {
        let head = false;
        const chain = {
          select: (_columns: string, options?: { head?: boolean }) => {
            head = options?.head ?? false;
            return chain;
          },
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => chain,
          limit: () => chain,
          gte: () => chain,
          lte: () => chain,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data: head
                ? null
                : table === "community_needs"
                  ? state.needs
                  : table === "steward_plans"
                    ? state.plans
                    : [],
              count: 0,
              error: null,
            }).then(resolve),
        };
        return chain;
      },
    },
  }),
}));
import { Route } from "@/routes/planning";
const Dashboard = Route.options.component as ComponentType;
beforeEach(() => {
  state.role = "owner";
  state.needs = [
    {
      id: "need-a",
      title: "Accessible resources",
      detail: "Useful local services",
      kind: "resource",
      priority: "normal",
      status: "open",
    },
  ];
  state.plans = [
    {
      id: "plan-a",
      need_id: "need-a",
      title: "A helpful contribution",
      contribution: "Find and verify useful local resources.",
      connection: "Local partner",
      gathering: "Only if requested",
      follow_up: "Check back with the team",
      follow_up_on: "2026-11-04",
      status: "draft",
      revision: 3,
      outcome: "",
    },
  ];
  state.rpc.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ configured: true })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Community Steward dashboard", () => {
  it("turns a real community need into a saved contribution-first draft", async () => {
    render(<Dashboard />);
    await screen.findByText("Accessible resources");
    fireEvent.click(screen.getByRole("button", { name: /Prepare a helpful response/ }));
    expect(screen.getByLabelText("Plan title")).toHaveValue("Accessible resources");
    fireEvent.click(screen.getByRole("button", { name: "Save draft plan" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith(
        "save_steward_plan",
        expect.objectContaining({
          workspace: "org-a",
          plan: expect.objectContaining({ need_id: "need-a", title: "Accessible resources" }),
          target_plan: null,
        }),
      ),
    );
  });
  it("binds approval to the plan revision the administrator reviewed", async () => {
    render(<Dashboard />);
    await screen.findByText("Accessible resources");
    fireEvent.click(screen.getByRole("button", { name: "Steward plans" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve plan" }));
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("review_steward_plan", {
        target_plan: "plan-a",
        expected_revision: 3,
        decision: "approve",
      }),
    );
  });
  it("does not offer viewers editing, approval or paid research actions", async () => {
    state.role = "viewer";
    render(<Dashboard />);
    await screen.findByText("Accessible resources");
    expect(
      screen.queryByRole("button", { name: /Prepare a helpful response/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Steward plans" }));
    expect(screen.queryByRole("button", { name: /Approve plan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft plan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    expect(screen.queryByRole("button", { name: "Run research" })).not.toBeInTheDocument();
  });
});
