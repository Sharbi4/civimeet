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
  for (const name of [
    "Organizer Chat",
    "Discover",
    "Events",
    "People",
    "Library",
    "Browser Sessions",
    "Connectors",
    "Approvals",
    "Activity",
    "Dashboard",
  ]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("heading", { level: 1, name })).toBeInTheDocument();
    expect(screen.getByRole("main").textContent?.length).toBeGreaterThan(50);
  }
  fireEvent.click(screen.getByRole("button", { name: "Organizer Chat" }));
  for (const name of ["Venue Research", "Outreach", "Volunteers", "Main Organizer Chat"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("heading", { name, level: 2 })).toBeInTheDocument();
  }
  expect(net).not.toHaveBeenCalled();
  net.mockRestore();
});
it("keeps approval decisions distinct from execution and edits pending", async () => {
  await mount();
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
  fireEvent.click(screen.getByRole("button", { name: "Browser Sessions" }));
  const draft = screen.getByRole("textbox", { name: "Sample browser draft" });
  expect(draft).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Take over sample" }));
  expect(draft).not.toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Hand back to organizer" }));
  expect(draft).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Stop sample task" }));
  expect(screen.getByRole("button", { name: "Take over sample" })).toBeDisabled();
});
