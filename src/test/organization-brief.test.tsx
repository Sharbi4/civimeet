import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationBrief } from "@/components/workspace/OrganizationBrief";
const mocks = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/components/workspace/WorkspaceGate", () => {
  const db = {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  };
  return {
    useWorkspace: () => ({
      organizationId: "org-a",
      role: "owner",
      db,
    }),
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
afterEach(cleanup);
describe("community onboarding", () => {
  it("progressively captures context, saves the organization brief, then offers a next step", async () => {
    const next = vi.fn();
    render(<OrganizationBrief next="research" onNext={next} />);
    fireEvent.change(await screen.findByLabelText("Who is coordinating this community?"), {
      target: { value: "Demo coordinator" },
    });
    fireEvent.change(
      screen.getByLabelText(
        "Which city, neighborhoods, and service area should your agent focus on?",
      ),
      {
        target: { value: "Demo area" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(
        "Who do you serve, what brings them together, and what is your mission?",
      ),
      {
        target: { value: "Help neighbors find resources." },
      },
    );
    expect(screen.queryByLabelText("Facebook responsibilities")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByLabelText("Facebook"));
    fireEvent.change(screen.getByLabelText("Facebook responsibilities"), {
      target: { value: "Draft helpful posts for review." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my community brief" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "save_organization_brief",
        expect.objectContaining({
          workspace: "org-a",
          brief: expect.objectContaining({
            area: "Demo area",
            platform_actions: expect.objectContaining({
              facebook: "Draft helpful posts for review.",
            }),
          }),
        }),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Explore local opportunities" }));
    expect(next).toHaveBeenCalledOnce();
  });
});
