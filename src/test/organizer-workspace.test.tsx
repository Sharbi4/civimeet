import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

/** Every query resolves to the rows for its table; any chained filter returns the same query. */
const tables: Record<string, unknown> = {};
const rpc = vi.fn(async (_name: string, _args?: unknown) => ({ data: null, error: null }));
function query(table: string) {
  const rows = tables[table] ?? [];
  const result = { data: rows, error: null, count: Array.isArray(rows) ? rows.length : 0 };
  const single = { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null };
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "in", "is", "gte", "lte", "order", "limit", "match", "filter", "or", "not"])
    chain[name] = () => chain;
  chain["single"] = () => Promise.resolve(single);
  chain["maybeSingle"] = () => Promise.resolve(single);
  chain["then"] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}
const channel = { on: () => channel, subscribe: () => channel, unsubscribe: () => undefined };
const db = {
  from: (table: string) => query(table),
  rpc: (name: string, args?: unknown) => rpc(name, args),
  channel: () => channel,
  removeChannel: () => undefined,
  auth: { getSession: async () => ({ data: { session: null } }) },
};
vi.mock("@/components/workspace/WorkspaceGate", () => ({
  useWorkspace: () => ({ db, organizationId: "org-1", role: "admin" }),
}));
vi.mock("@/components/workspace/OrganizerMode", () => ({
  OrganizerMode: ({ report }: { report?: React.ReactNode }) => (
    <div>
      <p>Conversation with Civi</p>
      {report}
    </div>
  ),
}));
vi.mock("@/components/workspace/OrganizerChat", () => ({
  OrganizerChat: () => <p>Research conversation</p>,
}));

import { LiveOrganizerWorkspace } from "@/components/workspace/OrganizerWorkspace";

const month = new Date().toISOString().slice(0, 7) + "-01";
beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  Object.assign(tables, {
    organizations: [{ name: "Tucson Community Alliance" }],
    organization_briefs: [{ mission: "Connect neighbors to resources.", area: "Tucson, AZ", event_goal: "" }],
    organization_connectors: [
      { connector: "facebook", status: "connected", detail: "" },
      { connector: "eventbrite", status: "needs_attention", detail: "Sign in again" },
    ],
    organizer_approvals: [
      {
        id: "a1",
        title: "Facebook Group post",
        content: "Neighbors, what resources would help most?",
        destination: "Facebook Group",
        kind: "post",
        status: "pending",
        revision: 1,
      },
    ],
    organization_payment_settings: [
      { organization_id: "org-1", monthly_budget_cents: 150000, auto_approve_limit_cents: 5000 },
    ],
    agent_payments: [
      {
        id: "p1",
        organization_id: "org-1",
        agent: "main",
        payee: "Reid Park Community Center",
        purpose: "Pavilion deposit",
        category: "venue",
        amount_cents: 25000,
        status: "needs_approval",
        approval: "pending",
        over_budget: false,
        budget_month: month,
        created_at: new Date().toISOString(),
      },
      {
        id: "p2",
        organization_id: "org-1",
        agent: "main",
        payee: "Tucson Print Shop",
        purpose: "Flyers",
        category: "vendor",
        amount_cents: 2900,
        status: "approved",
        approval: "auto",
        over_budget: false,
        budget_month: month,
        created_at: new Date().toISOString(),
      },
    ],
  });
  rpc.mockClear();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function mount() {
  const root = createRootRoute({ component: LiveOrganizerWorkspace });
  render(
    <RouterProvider
      router={createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) })}
    />,
  );
  await screen.findByText("Conversation with Civi");
  await screen.findAllByText("Tucson Community Alliance");
}

it("shows the real workspace with no sample or demo labels", async () => {
  await mount();
  expect(screen.getByRole("heading", { level: 1, name: "Civi" })).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/sample|demo/i);
  for (const name of ["Approvals", "Events", "Library", "Settings"]) {
    fireEvent.click(screen.getAllByRole("button", { name })[0]!);
    expect(screen.getByRole("heading", { level: 1, name })).toBeInTheDocument();
  }
  expect(document.body.textContent).not.toMatch(/sample|demo/i);
});

it("approving a draft records the decision without claiming it was sent", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Approvals" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve draft" }));
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith("review_organizer_approval", {
      target: "a1",
      expected_revision: 1,
      decision: "approve",
    }),
  );
  expect(await screen.findByText(/Nothing has been sent or paid yet/)).toBeInTheDocument();
});

it("collapses the sidebar to icons and remembers the choice", async () => {
  window.localStorage.removeItem("civimeet.rail");
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(window.localStorage.getItem("civimeet.rail")).toBe("closed");
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByRole("button", { name: "Civi" })).not.toHaveAttribute("title");
  window.localStorage.removeItem("civimeet.rail");
});

it("Civi reports on connected helpers, what needs people, and this month's spending", async () => {
  await mount();
  const report = screen.getByRole("region", { name: "Helper report" });
  expect(within(report).getByText("Facebook helper")).toBeInTheDocument();
  expect(within(report).getByText("Eventbrite helper")).toBeInTheDocument();
  expect(within(report).getByText(/\$29\.00 of \$1,500\.00 committed this month/)).toBeInTheDocument();
});

it("approving a payment in Settings never claims money was sent", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
  const payments = await screen.findByRole("region", { name: "Payments" });
  expect(await within(payments).findByText(/Reid Park Community Center · \$250\.00/)).toBeInTheDocument();
  fireEvent.click(within(payments).getByRole("button", { name: "Approve" }));
  expect(await screen.findByText(/isn’t paid until your payment account is connected/)).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith("review_agent_payment", expect.objectContaining({ decision: "approve" }));
});
