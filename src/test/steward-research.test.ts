// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { handleStewardResearch } from "@/lib/steward-research.server";
import { ResearchError } from "@/lib/perplexity.server";
import type { ResearchResult } from "@/lib/research";
const input = {
  organizationId: "4afef7ba-f3ae-4a34-a4dc-c255a8c81bd0",
  requestId: "6b4e9821-f58b-4aa9-b376-2352fb0d4f24",
  question: "Find accessible local community resources",
  purpose: "resources",
  location: "Tucson",
};
const result: ResearchResult = {
  provider: "perplexity",
  id: "response",
  answer: "A sourced brief",
  sources: [],
  model: "fixture",
  researchedAt: new Date().toISOString(),
  usage: { inputTokens: 20, outputTokens: 40, costUsd: null },
};
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request("https://civimeet.example/api/steward/research", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer session", ...headers },
    body: JSON.stringify(body),
  });
}
function dependencies() {
  return {
    configured: () => true,
    authorize: vi.fn().mockResolvedValue("verified-user"),
    reserve: vi.fn().mockResolvedValue({
      started: true,
      run: { id: "run", status: "running", result: null, error: null },
    }),
    context: vi.fn().mockResolvedValue("Scoped organization context"),
    research: vi.fn().mockResolvedValue(result),
    finish: vi.fn().mockResolvedValue(undefined),
  };
}
describe("Authenticated steward research", () => {
  it("uses the saved event area instead of caller geography before reserving and researching", async () => {
    const deps = {
      ...dependencies(),
      event: vi
        .fn()
        .mockResolvedValue({
          id: "event",
          title: "Local fair",
          purpose: "Meet neighbors",
          geographic_area: "Orlando, Florida",
          revision: 2,
          status: "draft",
        }),
    };
    const eventId = "8e0cf07d-a77a-4833-81b3-9b87f9edcf5c";
    const response = await handleStewardResearch(
      request({ ...input, eventId, location: "Tucson", skillId: "community_presence" }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.event).toHaveBeenCalledWith(input.organizationId, eventId);
    expect(deps.reserve).toHaveBeenCalledWith(
      "verified-user",
      expect.objectContaining({ location: "Orlando, Florida", eventId }),
    );
    expect(deps.research).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Orlando, Florida" }),
      expect.stringContaining('"geographic_area":"Orlando, Florida"'),
      false,
      "community_presence",
    );
  });
  it("does not research an unavailable or cross-organization event", async () => {
    const deps = {
      ...dependencies(),
      event: vi
        .fn()
        .mockRejectedValue(new ResearchError(404, "Event not found in this organization.")),
    };
    const response = await handleStewardResearch(
      request({ ...input, eventId: "8e0cf07d-a77a-4833-81b3-9b87f9edcf5c" }),
      deps,
    );
    expect(response.status).toBe(404);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.research).not.toHaveBeenCalled();
  });
  it("runs the presence skill with tenant context and saves its result without vendor collection", async () => {
    const deps = dependencies();
    const response = await handleStewardResearch(
      request({
        ...input,
        skillId: "community_presence",
        includeKnowledge: true,
        threadKey: "main",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.authorize).toHaveBeenCalledWith("session", input.organizationId);
    expect(deps.context).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: input.organizationId,
        skillId: "community_presence",
        includeKnowledge: true,
      }),
    );
    expect(deps.research).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "resources" }),
      "Scoped organization context",
      false,
      "community_presence",
    );
    expect(deps.finish).toHaveBeenCalledWith("run", result, null);
  });
  it("authenticates and reserves before spending, then saves real results", async () => {
    const deps = dependencies();
    const response = await handleStewardResearch(request(), deps);
    expect(response.status).toBe(200);
    expect(deps.authorize).toHaveBeenCalledWith("session", input.organizationId);
    expect(deps.reserve).toHaveBeenCalledWith("verified-user", expect.objectContaining(input));
    expect(deps.research).toHaveBeenCalledWith(
      expect.objectContaining({ question: input.question }),
      "Scoped organization context",
    );
    expect(deps.finish).toHaveBeenCalledWith("run", result, null);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("does not spend when organization authorization fails", async () => {
    const deps = dependencies();
    deps.authorize.mockRejectedValue(new ResearchError(403, "Access denied"));
    expect((await handleStewardResearch(request(), deps)).status).toBe(403);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.research).not.toHaveBeenCalled();
  });
  it("does not rerun an idempotent request", async () => {
    const deps = dependencies();
    deps.reserve.mockResolvedValue({
      started: false,
      run: { id: "run", status: "completed", result, error: null },
    });
    const response = await handleStewardResearch(request(), deps);
    expect((await response.json()).replayed).toBe(true);
    expect(deps.research).not.toHaveBeenCalled();
    expect(deps.context).not.toHaveBeenCalled();
  });
  it("enforces durable quotas before fetching context or calling the model", async () => {
    const deps = dependencies();
    deps.reserve.mockRejectedValue(new ResearchError(429, "Limit reached"));
    expect((await handleStewardResearch(request(), deps)).status).toBe(429);
    expect(deps.research).not.toHaveBeenCalled();
  });
  it("records sanitized failure without leaking provider diagnostics", async () => {
    const deps = dependencies();
    deps.research.mockRejectedValue(new Error("private provider token"));
    const response = await handleStewardResearch(request(), deps);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private provider token");
    expect(deps.finish).toHaveBeenCalledWith(
      "run",
      null,
      expect.stringContaining("Research could not finish"),
    );
  });
  it("rejects cross-origin, oversized, unauthenticated and malformed requests without spending", async () => {
    const deps = dependencies();
    expect(
      (await handleStewardResearch(request(input, { Origin: "https://attacker.example" }), deps))
        .status,
    ).toBe(403);
    expect((await handleStewardResearch(request(input, { Authorization: "" }), deps)).status).toBe(
      401,
    );
    expect(
      (await handleStewardResearch(request({ ...input, question: "x".repeat(20000) }), deps))
        .status,
    ).toBe(413);
    expect(
      (await handleStewardResearch(request({ ...input, organizationId: "bad" }), deps)).status,
    ).toBe(400);
    expect(deps.research).not.toHaveBeenCalled();
  });
  it("fails closed without server configuration", async () => {
    const deps = dependencies();
    deps.configured = () => false;
    expect((await handleStewardResearch(request(), deps)).status).toBe(503);
    expect(deps.authorize).not.toHaveBeenCalled();
  });
});

it("selects a trusted skill before reserving and preserves its output", async () => {
  const deps = dependencies();
  const response = await handleStewardResearch(
    request({ ...input, skillId: "attendance_outreach" }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps.reserve).toHaveBeenCalledWith(
    "verified-user",
    expect.objectContaining({
      skillId: "attendance_outreach",
      purpose: "general",
      collectVendors: false,
    }),
  );
  expect(deps.research).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: "general" }),
    expect.any(String),
    false,
    "attendance_outreach",
  );
});
it("rejects discovery without an agent and area before spending", async () => {
  const deps = dependencies();
  expect(
    (
      await handleStewardResearch(
        request({ ...input, skillId: "local_partner_discovery", location: "" }),
        deps,
      )
    ).status,
  ).toBe(400);
  expect(deps.reserve).not.toHaveBeenCalled();
});

it("preserves an allowed side-chat key and rejects arbitrary memory namespaces", async () => {
  const deps = dependencies();
  const response = await handleStewardResearch(request({ ...input, threadKey: "venue" }), deps);
  expect(response.status).toBe(200);
  expect(deps.reserve).toHaveBeenCalledWith(
    "verified-user",
    expect.objectContaining({ threadKey: "venue" }),
  );
  const rejected = dependencies();
  expect(
    (await handleStewardResearch(request({ ...input, threadKey: "other-organization" }), rejected))
      .status,
  ).toBe(400);
  expect(rejected.research).not.toHaveBeenCalled();
});
it("accepts the research query/type contract through the same authenticated reservation", async () => {
  const deps = dependencies();
  const response = await handleStewardResearch(
    request({
      organizationId: input.organizationId,
      requestId: input.requestId,
      query: input.question,
      type: "venues",
    }),
    deps,
  );
  expect(response.status).toBe(200);
  expect(deps.research).toHaveBeenCalledWith(
    expect.objectContaining({ question: input.question, purpose: "venues" }),
    expect.any(String),
  );
});
