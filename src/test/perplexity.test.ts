// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-only", () => ({}));

import { researchCommunity } from "@/lib/perplexity.server";

const input = {
  question: "Find accessible community meeting rooms",
  location: "Tucson, Arizona",
  purpose: "venues" as const,
};
const completed = {
  id: "resp_test",
  status: "completed",
  model: "provider-selected-model",
  output: [
    { type: "reasoning", content: [{ type: "reasoning_text", text: "Private reasoning" }] },
    {
      type: "search_results",
      results: [
        { id: 1, title: "Official venue", url: "https://example.org/meeting-room" },
        { id: 2, title: "Unsafe link", url: "javascript:alert(1)" },
        { id: 3, title: "Credential link", url: "https://name:password@example.org/" },
      ],
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "A community meeting room is listed here [1]." }],
    },
  ],
  usage: { input_tokens: 120, output_tokens: 30, cost: { currency: "USD", total_cost: 0.002 } },
};

afterEach(() => vi.unstubAllEnvs());

describe("Perplexity research adapter", () => {
  it("uses the current API with bounded web research and returns source IDs, not internal reasoning", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(completed));
    const result = await researchCommunity(input, {
      apiKey: "fixture-provider-credential",
      fetcher,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.perplexity.ai/v1/agent");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      effort: "fast",
      max_output_tokens: 2000,
      max_tool_calls: 3,
      store: false,
    });
    expect(result.answer).toBe("A community meeting room is listed here [1].");
    expect(result.sources).toEqual([
      { id: 1, title: "Official venue", url: "https://example.org/meeting-room" },
    ]);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30, costUsd: 0.002 });
    expect(JSON.stringify(result)).not.toContain("fixture-provider-credential");
  });

  it("fails closed without a server credential and never contacts the provider", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    const fetcher = vi.fn<typeof fetch>();
    await expect(researchCommunity(input, { fetcher })).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid agent input before spending credits", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      researchCommunity(
        { ...input, question: "" },
        { apiKey: "fixture-provider-credential", fetcher },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])("sanitizes provider failure %s", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive provider diagnostics", { status }));
    try {
      await researchCommunity(input, { apiKey: "fixture-provider-credential", fetcher });
      expect.fail("Expected provider failure");
    } catch (error) {
      expect(String(error)).not.toContain("sensitive provider diagnostics");
      expect(error).toMatchObject({ status: status === 429 ? 429 : 502 });
    }
  });

  it("handles connection failures without exposing request or provider data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret diagnostics"));
    await expect(
      researchCommunity(input, { apiKey: "fixture-provider-credential", fetcher }),
    ).rejects.toMatchObject({ status: 504 });
  });

  it("does not present incomplete output as a successful run", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...completed, status: "incomplete" }));
    await expect(
      researchCommunity(input, { apiKey: "fixture-provider-credential", fetcher }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("preserves unknown usage instead of implying a free request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...completed, usage: undefined }));
    const result = await researchCommunity(input, {
      apiKey: "fixture-provider-credential",
      fetcher,
    });
    expect(result.usage.costUsd).toBeNull();
  });
});
