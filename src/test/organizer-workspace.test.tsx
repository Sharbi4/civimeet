import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { DemoOrganizerWorkspace } from "@/components/workspace/OrganizerWorkspace";
afterEach(cleanup);
async function mount() {
  const root = createRootRoute({ component: DemoOrganizerWorkspace });
  render(
    <RouterProvider
      router={createRouter({
        routeTree: root,
        history: createMemoryHistory({ initialEntries: ["/"] }),
      })}
    />,
  );
  await screen.findByText("Demo / Sample data");
}
it("opens all rail views, switches chats, and never calls live services from the demo", async () => {
  const net = vi.spyOn(globalThis, "fetch");
  await mount();
  // Signing in lands on the agent chat.
  expect(screen.getByRole("heading", { level: 1, name: "Chat" })).toBeInTheDocument();
  for (const name of [
    "Search",
    "Feed",
    "Ideas",
    "Goals",
    "Events",
    "Library",
    "Approvals",
    "Connections",
    "Live browser",
    "Overview",
    "People",
    "Activity",
    "Chat",
  ]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("heading", { level: 1, name })).toBeInTheDocument();
    expect(screen.getByRole("main").textContent?.length).toBeGreaterThan(50);
  }
  fireEvent.click(screen.getByRole("button", { name: "Chat" }));
  // Each connected platform has its own agent conversation next to the main agent.
  for (const name of ["Facebook Agent", "Venue Research", "Outreach", "Volunteers", "Main Agent"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("heading", { name, level: 2 })).toBeInTheDocument();
  }
  expect(net).not.toHaveBeenCalled();
  net.mockRestore();
});
it("keeps approval decisions distinct from execution and edits pending", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Approvals" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Draft to review"), {
    target: { value: "Edited invitation for human review before any publishing." },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save for review" }));
  await screen.findByText("Draft saved for review.");
  expect(
    screen.getByText("Edited invitation for human review before any publishing."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Approve draft" })[0]!);
  await screen.findByText("Sample approved. Nothing was posted, booked, or paid.");
  fireEvent.click(screen.getByRole("button", { name: "Show review history" }));
  expect(screen.getByText(/Decision recorded/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Activity" }));
  expect(screen.getByText(/Sample Facebook Group draft post: approve/)).toBeInTheDocument();
});
it("browser demo pauses, hands back, and stops without changing any real account", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Live browser" }));
  const draft = screen.getByRole("textbox", { name: "Sample browser draft" });
  expect(draft).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Take over sample" }));
  expect(draft).not.toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Hand back to organizer" }));
  expect(draft).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Stop sample task" }));
  expect(screen.getByRole("button", { name: "Take over sample" })).toBeDisabled();
});

it("collapses the sidebar to icons and remembers the choice", async () => {
  window.localStorage.removeItem("civimeet.rail");
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(window.localStorage.getItem("civimeet.rail")).toBe("closed");
  expect(screen.queryByRole("button", { name: "Main Agent" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Goals" })).toHaveAttribute("title", "Goals");
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByRole("button", { name: "Main Agent" })).toBeInTheDocument();
  window.localStorage.removeItem("civimeet.rail");
});

it("shows the agent panel beside the chat with approvals, browser control and stop", async () => {
  await mount();
  const panel = screen.getByRole("complementary", { name: "Main Agent panel" });
  expect(within(panel).getByText("Waiting for you")).toBeInTheDocument();
  expect(within(panel).getAllByRole("button", { name: "Approve" }).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Facebook Agent" }));
  const facebook = screen.getByRole("complementary", { name: "Facebook Agent panel" });
  fireEvent.click(within(facebook).getByRole("tab", { name: "Browser" }));
  fireEvent.click(within(facebook).getByRole("button", { name: "Take over" }));
  expect(within(facebook).getByRole("button", { name: "Give back to agent" })).toBeInTheDocument();
  fireEvent.click(within(facebook).getByRole("button", { name: "Stop agent" }));
  expect(await within(facebook).findByRole("button", { name: "Resume agent" })).toBeInTheDocument();
  expect(within(facebook).getByText("Stopped")).toBeInTheDocument();
  fireEvent.click(within(facebook).getByRole("tab", { name: "Memory" }));
  expect(within(facebook).getByText(/Midvale Park Neighbors group/)).toBeInTheDocument();
  fireEvent.click(within(facebook).getByRole("button", { name: "Hide agent panel" }));
  expect(screen.getByRole("button", { name: "Agent panel" })).toBeInTheDocument();
});
