// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { createAgentMemoryClient } from "@/lib/agent-memory.server";
import { blankVendor, discoverySchema } from "@/lib/vendors";

const discovery = {
  details: { ...blankVendor, name: "Fixture Catering", service_areas: ["Tucson"] },
  links: [{ platform: "facebook" as const, url: "https://facebook.com/fixture" }],
  source_url: "https://example.org/community",
  source_excerpt: "Public business description",
  idempotency_key: "922beab3-4794-4764-8277-20c4ca248ceb",
};
const settings = {
  databaseUrl: "https://project.example",
  publishableKey: "fixture-public-key",
  agentToken: "fixture-private-worker-token-32-chars",
};

describe("Agent knowledge client", () => {
  it("preserves idempotency and uses the scoped worker credential without caller tenant IDs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ vendor_id: "saved", replayed: false }));
    const client = createAgentMemoryClient({ ...settings, fetcher });
    await client.collectVendor(
      discoverySchema.parse({ ...discovery, organization_id: "forged", agent_id: "forged" }),
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://project.example/rest/v1/rpc/collect_agent_vendor");
    const body = JSON.parse(init!.body as string);
    expect(body.agent_token).toBe(settings.agentToken);
    expect(body.discovery.idempotency_key).toBe(discovery.idempotency_key);
    expect(body.discovery.organization_id).toBeUndefined();
    expect(body.discovery.agent_id).toBeUndefined();
  });
  it("rejects unsafe source URLs before writing knowledge", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createAgentMemoryClient({ ...settings, fetcher });
    await expect(
      client.collectVendor({ ...discovery, source_url: "javascript:alert(1)" }),
    ).rejects.toThrow();
    await expect(
      client.collectVendor({ ...discovery, source_url: "https://user:password@example.org" }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("supports repeatable memory keys and expiration without exposing another agent selector", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json("saved-memory"));
    const client = createAgentMemoryClient({ ...settings, fetcher });
    await client.remember({
      key: "conversation:42",
      kind: "conversation_summary",
      content: "A member asked about venue access.",
      expiresAt: "2026-11-30T00:00:00Z",
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
      entry_key: "conversation:42",
      expiry: "2026-11-30T00:00:00Z",
      agent_token: settings.agentToken,
    });
  });
  it("sanitizes remote failures instead of logging credentials or content", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive diagnostic", { status: 403 }));
    await expect(createAgentMemoryClient({ ...settings, fetcher }).recall()).rejects.toThrow(
      "Agent knowledge request failed (403)",
    );
  });
  it("accepts an empty work queue without inventing an active job", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(null));
    expect(await createAgentMemoryClient({ ...settings, fetcher }).claimWork()).toBeNull();
  });
  it("refuses sending worker credentials over an insecure remote connection", () => {
    expect(() =>
      createAgentMemoryClient({ ...settings, databaseUrl: "http://remote.example" }),
    ).toThrow("secure database URL");
  });
});
