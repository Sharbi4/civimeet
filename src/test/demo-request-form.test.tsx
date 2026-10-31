import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { DemoRequestForm } from "@/components/site/DemoRequestPage";
import type { DemoRequest, DemoRequestResult } from "@/lib/demo-request";

vi.mock("@/lib/demo-request.functions", () => ({ submitDemoRequest: vi.fn() }));
afterEach(cleanup);
async function setup(send: (data: DemoRequest) => Promise<DemoRequestResult>) {
  const root = createRootRoute({ component: () => <DemoRequestForm source="get-started" send={send} /> });
  render(<RouterProvider router={createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) })} />);
  await screen.findByRole("button", { name: "Request a demo" });
}
describe("demo request form", () => {
  it("validates empty details without submitting", async () => {
    const send = vi.fn(); await setup(send);
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
  it("submits real details and shows saved confirmation", async () => {
    const send = vi.fn().mockResolvedValue({ saved: true }); await setup(send);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jane@example.org" } });
    fireEvent.change(screen.getByLabelText("Organization", { exact: true }), { target: { value: "Local Community" } });
    fireEvent.change(screen.getByLabelText("Organization type"), { target: { value: "neighborhood" } });
    fireEvent.click(screen.getByRole("button", { name: "Request a demo" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: "Jane", email: "jane@example.org", organization: "Local Community", organizationType: "neighborhood", source: "get-started" }));
  });
});