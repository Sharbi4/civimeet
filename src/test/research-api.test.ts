// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/perplexity.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/perplexity.server")>();
  return { ...original, researchCommunity: vi.fn() };
});

import { handleResearch, researchStatus } from "@/lib/research-api.server";
import { researchCommunity } from "@/lib/perplexity.server";

const operatorToken = "fixture-operator-token-for-testing-only";
function request(
  body = JSON.stringify({
    question: "Find community meeting rooms",
    purpose: "venues",
    location: "Tucson",
  }),
  token = operatorToken,
  origin = "https://civimeet.example",
) {
  return new Request("https://civimeet.example/api/agent/research", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("CIVIMEET_RESEARCH_TOKEN", operatorToken);
  vi.stubEnv("PERPLEXITY_API_KEY", "fixture-provider-credential");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("Private research API", () => {
  it("returns only configuration flags, never secret values", async () => {
    const response = researchStatus();
    expect(await response.json()).toEqual({ configured: true, accessConfigured: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("requires operator access even when the provider is configured", async () => {
    for (const token of ["", "incorrect", `${operatorToken.slice(0, -1)}x`]) {
      expect((await handleResearch(request(undefined, token))).status).toBe(401);
    }
    expect(researchCommunity).not.toHaveBeenCalled();
  });
  it("fails closed when the access token is missing or weak", async () => {
    vi.stubEnv("CIVIMEET_RESEARCH_TOKEN", "short");
    expect((await handleResearch(request())).status).toBe(503);
    expect(researchCommunity).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests before calling the provider", async () => {
    expect(
      (await handleResearch(request(undefined, operatorToken, "https://other.example"))).status,
    ).toBe(403);
    expect(researchCommunity).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, invalid input and oversized bodies", async () => {
    expect((await handleResearch(request("{"))).status).toBe(400);
    expect((await handleResearch(request("{}"))).status).toBe(400);
    expect((await handleResearch(request("x".repeat(17_000)))).status).toBe(413);
    expect(researchCommunity).not.toHaveBeenCalled();
  });
  it("allows an authorized request and prevents overlapping credit use", async () => {
    let finish: (value: Awaited<ReturnType<typeof researchCommunity>>) => void = () => {};
    vi.mocked(researchCommunity).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = handleResearch(request());
    await vi.waitFor(() => expect(researchCommunity).toHaveBeenCalledOnce());
    expect((await handleResearch(request())).status).toBe(429);
    finish({
      provider: "perplexity",
      id: "resp_test",
      answer: "Research result",
      sources: [],
      model: "test-model",
      researchedAt: "2026-10-30T12:00:00Z",
      usage: { inputTokens: null, outputTokens: null, costUsd: null },
    });
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).answer).toBe("Research result");
  });
});
