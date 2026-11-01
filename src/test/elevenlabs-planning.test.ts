// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createVoicePlanningTools } from "@/lib/elevenlabs-planning";

const research = {
  provider: "perplexity",
  id: "px-1",
  answer: "Compare two accessible venues. Confirm price and capacity before choosing.",
  sources: [{ id: 1, title: "City venue", url: "https://example.org/venue" }],
  model: "test",
  researchedAt: "2026-10-31T00:00:00Z",
  usage: { inputTokens: 20, outputTokens: 100, costUsd: null },
};

describe("ElevenLabs planning tool bridge", () => {
  it("uses an authenticated, organization-scoped Perplexity research request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ run: { id: "run-1", status: "completed", result: research } }),
      );
    const tool = createVoicePlanningTools({
      organizationId: "4afef7ba-f3ae-4a34-a4dc-c255a8c81bd0",
      accessToken: async () => "secret-user-jwt",
      fetcher,
    });
    const output = await tool.startPlanningResearch({
      request: "Plan a community gathering for 100 neighbors",
      location: "Tucson, AZ",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [path, init] = fetcher.mock.calls[0]!;
    expect(path).toBe("/api/research");
    expect(init.headers.Authorization).toBe("Bearer secret-user-jwt");
    expect(JSON.parse(init.body)).toMatchObject({
      organizationId: "4afef7ba-f3ae-4a34-a4dc-c255a8c81bd0",
      purpose: "events",
      skillId: "event_design",
      threadKey: "main",
      collectVendors: false,
    });
    expect(output).toContain("prepared_for_review");
    expect(output).toContain("example.org/venue");
    expect(output).not.toContain("secret-user-jwt");
  });

  it("does not call research without sign-in or a valid planning request", async () => {
    const fetcher = vi.fn();
    const tool = createVoicePlanningTools({
      organizationId: "org",
      accessToken: async () => null,
      fetcher,
    });
    expect(await tool.startPlanningResearch({ request: "short" })).toContain("10 to 3,000");
    expect(await tool.startPlanningResearch({ request: "Plan a volunteer celebration" })).toContain(
      "Sign in",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never treats a quota failure as successful work", async () => {
    const tool = createVoicePlanningTools({
      organizationId: "org",
      accessToken: async () => "token",
      fetcher: vi
        .fn()
        .mockResolvedValue(Response.json({ error: "Limit reached" }, { status: 429 })),
    });
    expect(await tool.startPlanningResearch({ request: "Plan a community cleanup day" })).toContain(
      "limit",
    );
  });
});
