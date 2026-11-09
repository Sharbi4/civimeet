// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { handleManagedOrganizer, executeOrganizerTool, toolRequestId, OrganizerError, type OrganizerDependencies } from "@/lib/ai/managed-organizer.server";
const org = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const row = { id: "local", organization_id: org, provider_id: "provider-owned", lease_id: "lease", lease_until: null };
const req = (body: Record<string, unknown> = {}, headers: Record<string, string> = {}) => new Request("https://civimeet.example/api/organizer", { method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json", ...headers }, body: JSON.stringify({ organizationId: org, thread: "main", action: "send", message: "Help us organize a gathering", requestId, ...body }) });
function dependencies() {
  const events = Object.assign((async function* () { yield { type: "agent.session.turn.output_text.delta", item_id: "answer", content_index: 0, delta: "Hello" }; yield { type: "agent.session.turn.output_text.done", item_id: "answer", content_index: 0, text: "Hello community" }; yield { type: "agent.session.turn.completed", turn: { subagent_id: null } }; })(), { controller: new AbortController() });
  const api = { retrieve: vi.fn().mockResolvedValue({ status: "idle", required_actions: [], usage: { total_tokens: 10 } }), create: vi.fn().mockResolvedValue({ id: "new-provider" }), delete: vi.fn().mockResolvedValue({}), events: { create: vi.fn().mockResolvedValue(undefined), stream: vi.fn().mockResolvedValue(events) }, items: { list: vi.fn().mockResolvedValue({ data: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: "Saved venue" }] }], has_more: false }) } };
  const d = { configuration: () => ({ ready: true, enabled: true, provider: "openai", browserEnabled: false, dailyMessageLimit: 30 }), provider: () => api as unknown as ReturnType<OrganizerDependencies["provider"]>, authorize: vi.fn().mockResolvedValue("actor"), current: vi.fn().mockResolvedValue({ ...row }), reserve: vi.fn().mockResolvedValue({ session: { ...row }, replayed: false }), update: vi.fn().mockResolvedValue(undefined), archive: vi.fn().mockResolvedValue(undefined), context: vi.fn().mockResolvedValue('{"mission":"Community service"}'), researchAgent: vi.fn().mockResolvedValue("web-agent"), research: vi.fn().mockResolvedValue(Response.json({ run: { status: "completed" } })), helpers: vi.fn().mockResolvedValue('{"helpers":[]}'), requestPayment: vi.fn().mockResolvedValue('{"status":"needs_approval"}') };
  return { d, api };
}
describe("managed organizer authorization and execution", () => {
  it("streams real provider events and uses the saved session, subscribing before submission", async () => {
    const { d, api } = dependencies();
    const r = await handleManagedOrganizer(req(), d); const text = await r.text();
    expect(r.status).toBe(200); expect(text).toContain('"text":"Hello community"'); expect(text).toContain('"status":"completed"');
    expect(api.events.stream).toHaveBeenCalledWith("provider-owned", expect.anything());
    expect(api.events.create.mock.invocationCallOrder[0]).toBeGreaterThan(api.events.stream.mock.invocationCallOrder[0]!);
    expect(api.events.create).toHaveBeenCalledWith("provider-owned", expect.objectContaining({ "Idempotency-Key": requestId }));
    expect(d.update).toHaveBeenCalledWith(row, { lease_id: null, lease_until: null });
  });
  it("denies a nonmember before touching the provider or reserving a turn", async () => {
    const { d, api } = dependencies(); d.authorize.mockRejectedValue(new OrganizerError(403, "Denied"));
    expect((await handleManagedOrganizer(req(), d)).status).toBe(403); expect(d.reserve).not.toHaveBeenCalled(); expect(api.retrieve).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied provider IDs", async () => {
    const { d } = dependencies(); expect((await handleManagedOrganizer(req({ provider_id: "other-tenant" }), d)).status).toBe(400); expect(d.authorize).not.toHaveBeenCalled();
  });
  it("reports missing configuration honestly without creating a provider session", async () => {
    const { d, api } = dependencies(); d.configuration = () => ({ ready: false, enabled: false, provider: "openai", browserEnabled: false, dailyMessageLimit: 30 });
    const r = await handleManagedOrganizer(req({ action: "status" }), d); expect(await r.json()).toMatchObject({ status: "configuration_required" }); expect(api.create).not.toHaveBeenCalled();
  });
  it("restores saved messages and requests real provider cancellation", async () => {
    const { d, api } = dependencies();
    expect(await (await handleManagedOrganizer(req({ action: "status" }), d)).json()).toMatchObject({ messages: [{ text: "Saved venue" }] });
    expect(await (await handleManagedOrganizer(req({ action: "cancel" }), d)).json()).toEqual({ status: "cancellation_requested" });
    expect(api.events.create).toHaveBeenCalledWith("provider-owned", { events: [{ type: "agent.session.input.cancel" }] });
  });
  it("does not resubmit a replayed message", async () => {
    const { d, api } = dependencies(); d.reserve.mockResolvedValue({ session: { ...row }, replayed: true });
    await (await handleManagedOrganizer(req(), d)).text(); expect(api.events.create).not.toHaveBeenCalled();
  });
  it("starts a new session with organization context, bounded spend and no browser tool", async () => {
    const { d, api } = dependencies(); d.reserve.mockResolvedValue({ session: { ...row, provider_id: null } as unknown as typeof row, replayed: false });
    await (await handleManagedOrganizer(req(), d)).text();
    const config = api.create.mock.calls[0]![0]; expect(config.agent.instructions).toContain("Community service"); expect(config.environment.type).toBe("none"); expect(config.input).toBe("Help us organize a gathering"); expect(config.agent.reasoning.effort).toBe("medium"); expect(config.spend_control).toBeUndefined(); expect(config.agent.tools.every((t: { type: string }) => t.type === "function")).toBe(true); expect(api.events.create).not.toHaveBeenCalled();
  });
  it("blocks cross-site and oversized requests before authentication", async () => {
    const { d } = dependencies(); expect((await handleManagedOrganizer(req({}, { Origin: "https://other.example" }), d)).status).toBe(403);
    expect((await handleManagedOrganizer(req({ message: "x".repeat(33000) }), d)).status).toBe(413); expect(d.authorize).not.toHaveBeenCalled();
  });
  it("research uses the authorized org, selected agent and stable call ID", async () => {
    const { d } = dependencies(); const scope = { org, actor: "actor", token: "fixture", url: "https://civimeet.example", callId: "call-1" };
    await executeOrganizerTool("research_local", { question: "Find local venues", location: "Tucson" }, scope, d);
    const body = await d.research.mock.calls[0]![0].json(); expect(body).toMatchObject({ organizationId: org, agentId: "web-agent", requestId: toolRequestId("call-1"), collectVendors: true, purpose: "vendors" });
    await expect(executeOrganizerTool("send_message", {}, scope, d)).rejects.toThrow("not available");
    await expect(executeOrganizerTool("research_local", { question: "Find venues", location: "Tucson", organizationId: "other" }, scope, d)).rejects.toThrow();
  });
  it("routes Civi's payment requests through the signed-in person's budget check", async () => {
    const { d } = dependencies();
    const scope = { org, actor: "actor", token: "fixture", url: "https://civimeet.example", callId: "call_1" };
    await executeOrganizerTool("request_payment", { payee: "Reid Park", purpose: "Pavilion deposit", category: "venue", amount_usd: 250 }, scope, d);
    expect(d.authorize).toHaveBeenCalledWith("fixture", org);
    expect(d.requestPayment).toHaveBeenCalledWith("fixture", org, expect.objectContaining({ amount_usd: 250, category: "venue" }));
    await expect(executeOrganizerTool("request_payment", { payee: "X", purpose: "?", category: "venue", amount_usd: -5 }, scope, d)).rejects.toThrow();
  });
});
import { organizerModel } from "@/lib/ai/managed-organizer.server";
describe("organizer model setting", () => {
  it("uses the configured model name and ignores text that isn't one", () => {
    expect(organizerModel({ OPENAI_ORGANIZER_MODEL: "gpt-5.5" })).toBe("gpt-5.5");
    expect(organizerModel({ OPENAI_ORGANIZER_MODEL: "please use the newest chat gpt model for our community agent ".repeat(3) })).toBe("gpt-6-sol");
    expect(organizerModel({})).toBe("gpt-6-sol");
  });
});
import OpenAI from "openai";
import { retryTransient } from "@/lib/ai/managed-organizer.server";
const providerError = (status: number) => OpenAI.APIError.generate(status, { message: "fixture", type: "fixture", code: status === 503 ? "service_unavailable_error" : "fixture" }, "fixture", new Headers());
describe("organizer provider hiccups", () => {
  it("retries a safe provider call after a temporary 503 and then succeeds", async () => {
    const call = vi.fn().mockRejectedValueOnce(providerError(503)).mockResolvedValue("ok");
    await expect(retryTransient(call, [0, 0])).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("does not retry configuration errors such as a bad model", async () => {
    const call = vi.fn().mockRejectedValue(providerError(400));
    await expect(retryTransient(call, [0, 0])).rejects.toBeInstanceOf(OpenAI.APIError);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("answers a lasting OpenAI outage with 503 and a JSON explanation, never 502", async () => {
    const { d, api } = dependencies(); api.retrieve.mockRejectedValue(providerError(503));
    const r = await handleManagedOrganizer(req(), d);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ retryable: true, error: expect.stringContaining("busy") });
    expect(api.retrieve).toHaveBeenCalledTimes(3);
    expect(d.update).toHaveBeenCalledWith(expect.objectContaining({ id: "local" }), { lease_id: null, lease_until: null });
  });
  it("reports OpenAI configuration problems as 424 without retrying", async () => {
    const { d, api } = dependencies(); api.retrieve.mockRejectedValue(providerError(404));
    const r = await handleManagedOrganizer(req(), d);
    expect(r.status).toBe(424); expect(api.retrieve).toHaveBeenCalledTimes(1);
  });
});
