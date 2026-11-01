import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { CompactHome } from "@/components/home/CompactHome";
afterEach(cleanup);
it("keeps the walkthrough optional and dismissible while exposing the main next steps", async () => {
  const root = createRootRoute({ component: CompactHome });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  const trigger = await screen.findByRole("button", { name: "See how it works" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Proposed plans/ })).toHaveAttribute("href", "/pricing");
  expect(screen.getAllByRole("link", { name: /Request a demo/ })[0]).toHaveAttribute(
    "href",
    "/get-started",
  );
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(
    "See your Community Steward at work",
  );
  fireEvent.click(screen.getByRole("button", { name: "Plan a gathering" }));
  expect(screen.getByRole("button", { name: "Plan a gathering" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});
