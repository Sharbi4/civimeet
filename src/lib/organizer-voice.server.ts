import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const inputSchema = z.object({ organizationId: z.string().uuid(), thread: z.enum(["main", "venue", "outreach", "volunteers", "discover"]), action: z.enum(["status", "start"]) }).strict();
export class VoiceAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function canUseOrganizerVoice(role: string | undefined) {
  return role !== undefined && ["owner", "admin", "organizer"].includes(role);
}
export async function authorizeVoice(token: string, organizationId: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new VoiceAccessError(503, "Workspace sign-in is unavailable.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    },
  } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new VoiceAccessError(401, "Sign in again to use voice.");
  const membership = await db.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", data.user.id).maybeSingle();
  if (membership.error || !canUseOrganizerVoice(membership.data?.role)) throw new VoiceAccessError(403, "Organization editor access is required for voice.");
}

// Fail closed on unknown configuration: prompts are not an authorization boundary.
export function isIsolatedVoiceAgent(agent: unknown): boolean {
  function hasUnsafeConfiguration(value: unknown, path = ""): boolean {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) => {
      const next = `${path}.${key}`;
      const hasContent = Array.isArray(child) ? child.length > 0 : child !== null && child !== undefined && child !== false && child !== "" && (typeof child !== "object" || Object.keys(child).length > 0);
      if (/^(tools|tool_ids|tools_config_list|mcp_servers|mcp_server_ids|knowledge_base|procedure_ids|start_procedure_ids|procedures)$/.test(key) && hasContent) return true;
      if (/override/i.test(next) && child === true) return true;
      return hasUnsafeConfiguration(child, next);
    });
  }
  const schema = z.object({
    platform_settings: z.object({ auth: z.object({ enable_auth: z.literal(true) }) }),
    conversation_config: z.object({ agent: z.object({ prompt: z.object({
      tools: z.array(z.unknown()).max(0).optional(),
      tool_ids: z.array(z.unknown()).max(0).optional(),
      knowledge_base: z.array(z.unknown()).max(0).optional(),
    }) }) }),
    workflow: z.union([z.null(), z.object({ nodes: z.record(z.unknown()).refine(nodes => Object.keys(nodes).length === 0), edges: z.record(z.unknown()).optional() })]).optional(),
  });
  return schema.safeParse(agent).success && !hasUnsafeConfiguration(agent);
}
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function handleOrganizerVoice(request: Request, authorize = authorizeVoice, provider = fetch) {
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Cross-site requests are not allowed." }, 403);
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.{1,8192})$/)?.[1];
  if (!bearer) return json({ error: "Sign in to use voice." }, 401);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "Send voice settings as JSON." }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing voice settings." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 2048) { await reader.cancel(); return json({ error: "Voice request is too large." }, 413); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = inputSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return json({ error: "Check organization and conversation." }, 400);
    await authorize(bearer, parsed.data.organizationId);
    const key = process.env["ELEVENLABS_API_KEY"];
    const agentId = process.env["ELEVENLABS_AGENT_ID"];
    if (!key || !agentId) return json({ configured: false, mode: "disabled-demo", reason: "Voice demo disabled — a private, tool-free ElevenLabs agent is not configured." });
    const call = async (path: string) => {
      const response = await provider(`https://api.elevenlabs.io/v1${path}`, { headers: { "xi-api-key": key }, signal: request.signal });
      if (!response.ok) {
        const body = await response.text();
        console.error(`ElevenLabs voice failed [${response.status}]: ${body}`);
        throw new VoiceAccessError(response.status, `ElevenLabs voice is unavailable (${response.status}). Check the connected account and agent configuration.`);
      }
      return response.json();
    };
    const agent = await call(`/convai/agents/${encodeURIComponent(agentId)}`);
    if (!isIsolatedVoiceAgent(agent)) return json({ configured: false, mode: "disabled-demo", reason: "Voice demo disabled — agent authentication, tools, knowledge, or workflow configuration needs review." });
    if (parsed.data.action === "status") return json({ configured: true, mode: "ready" });
    const issued = await call(`/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`);
    if (typeof issued.token !== "string" || !issued.token) throw new VoiceAccessError(502, "ElevenLabs returned no conversation token.");
    return json({ configured: true, conversationToken: issued.token, organizationId: parsed.data.organizationId, thread: parsed.data.thread });
  } catch (error) {
    return json({ error: error instanceof VoiceAccessError ? error.message : "Voice could not start." }, error instanceof VoiceAccessError ? error.status : 400);
  }
}