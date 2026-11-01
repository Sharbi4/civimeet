// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { canUseOrganizerVoice, handleOrganizerVoice, isIsolatedVoiceAgent, VoiceAccessError } from "@/lib/organizer-voice.server";
const organizationId = "11111111-1111-4111-8111-111111111111";
const safeAgent = { platform_settings: { auth: { enable_auth: true } }, conversation_config: { agent: { prompt: { tools: [], tool_ids: [], knowledge_base: [] } } } };
function request(action = "start", extra = {}, token = "fixture-token") {
  return new Request("https://civimeet.example/api/organizer/voice", { method: "POST", headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body: JSON.stringify({ organizationId, thread: "main", action, ...extra }) });
}
afterEach(() => { vi.unstubAllEnvs(); });
describe("Organizer voice boundaries", () => {
  it("requires sign-in before contacting ElevenLabs", async () => {
    const provider = vi.fn(); const authorize = vi.fn();
    expect((await handleOrganizerVoice(request("start", {}, ""), authorize, provider)).status).toBe(401);
    expect(authorize).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
  });
  it("requires membership in the exact requested organization", async () => {
    const provider = vi.fn(); const authorize = vi.fn(async (_token, org) => { expect(org).toBe(organizationId); throw new VoiceAccessError(403, "No membership"); });
    expect((await handleOrganizerVoice(request(), authorize, provider)).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it.each(["viewer", "member", "", undefined])("does not authorize role %s", role => expect(canUseOrganizerVoice(role)).toBe(false));
  it.each(["owner", "admin", "organizer"])("authorizes existing editor role %s", role => expect(canUseOrganizerVoice(role)).toBe(true));
  it("uses disabled demo mode without an agent, never a mock token", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "fixture-key"); vi.stubEnv("ELEVENLABS_AGENT_ID", "");
    const provider = vi.fn(); const result = await (await handleOrganizerVoice(request(), async () => {}, provider)).json();
    expect(result.mode).toBe("disabled-demo"); expect(result.conversationToken).toBeUndefined(); expect(provider).not.toHaveBeenCalled();
  });
  it("rejects untrusted agent IDs and invalid thread scope", async () => {
    const provider = vi.fn();
    expect((await handleOrganizerVoice(request("start", { agentId: "attacker-agent" }), async () => {}, provider)).status).toBe(400);
    expect((await handleOrganizerVoice(request("start", { thread: "other-org" }), async () => {}, provider)).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not issue tokens to agents with outbound tools or shared memory", () => {
    expect(isIsolatedVoiceAgent(safeAgent)).toBe(true);
    for (const field of ["tools", "tool_ids", "knowledge_base"]) expect(isIsolatedVoiceAgent({ ...safeAgent, conversation_config: { agent: { prompt: { [field]: ["outbound"] } } } })).toBe(false);
    expect(isIsolatedVoiceAgent({ ...safeAgent, workflow: { nodes: { call: {} } } })).toBe(false);
    expect(isIsolatedVoiceAgent({ ...safeAgent, platform_settings: { auth: { enable_auth: false } } })).toBe(false);
  });
  it("only obtains a token after Start, scoped to the authorized thread and organization", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "fixture-key"); vi.stubEnv("ELEVENLABS_AGENT_ID", "agent-fixture");
    const provider = vi.fn().mockResolvedValueOnce(Response.json(safeAgent)).mockResolvedValueOnce(Response.json(safeAgent)).mockResolvedValueOnce(Response.json({ token: "fixture-conversation-token" }));
    await handleOrganizerVoice(request("status"), async () => {}, provider);
    expect(provider).toHaveBeenCalledTimes(1);
    const result = await (await handleOrganizerVoice(request(), async () => {}, provider)).json();
    expect(result).toMatchObject({ organizationId, thread: "main", conversationToken: "fixture-conversation-token" });
    expect(provider.mock.calls.map(call => call[0])).toEqual(["https://api.elevenlabs.io/v1/convai/agents/agent-fixture", "https://api.elevenlabs.io/v1/convai/agents/agent-fixture", "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent-fixture"]);
    expect(provider.mock.calls.every(call => !call[1].method || call[1].method === "GET")).toBe(true);
  });
});