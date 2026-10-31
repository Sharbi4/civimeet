import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AudienceSelector, PlatformExplorer, StewardMiniDemo } from "@/components/home/HomeInteractive";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";

afterEach(cleanup);

async function withRouter(ui: ReactNode) {
  const root = createRootRoute({ component: () => <>{ui}<Outlet /></> });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) });
  render(<RouterProvider router={router} />);
  await screen.findAllByRole("button");
}

describe("homepage interactive controls", () => {
  it("steward demo switches tasks by click and keyboard without network", async () => {
    const net = vi.spyOn(globalThis, "fetch");
    await withRouter(<StewardMiniDemo />);
    expect(screen.getByText("Illustrative demo · no live actions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft for approval" }));
    expect(screen.getByRole("button", { name: "Draft for approval" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Waiting for a human")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Draft for approval" }), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Plan a gathering" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: /six-scene demo/ })).toHaveAttribute("href", "/product#interactive-demo");
    expect(net).not.toHaveBeenCalled();
    net.mockRestore();
  });

  it("platform explorer reports honest status per platform", async () => {
    await withRouter(<PlatformExplorer />);
    expect(screen.getByText("Supervised public browsing available")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nextdoor/ }));
    expect(screen.getByText("Restricted · pending provider access")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Eventbrite/ }));
    expect(screen.getByText("Planned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^X/ }));
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("audience selector links to the matching solution page", async () => {
    await withRouter(<AudienceSelector />);
    fireEvent.click(screen.getByRole("button", { name: "Neighborhood associations" }));
    expect(screen.getByRole("link", { name: /neighborhood associations/i })).toHaveAttribute(
      "href",
      "/solutions/neighborhood-associations",
    );
  });

  it("homepage route still matches", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/").at(-1)?.routeId).toBe("/");
  });
});
