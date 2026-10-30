import "@tanstack/react-start/server-only";
import { z } from "zod";
import { discoverySchema, publicUrl } from "./vendors";

type WorkerSettings = {
  databaseUrl: string;
  publishableKey: string;
  agentToken: string;
  fetcher?: typeof fetch;
};

const memorySchema = z.object({
  key: z.string().min(1).max(160),
  kind: z.enum(["fact", "conversation_summary", "follow_up", "checkpoint"]),
  content: z.string().trim().min(1).max(12000),
  source: z.union([z.literal(""), publicUrl]).default(""),
  expiresAt: z.string().datetime().nullable().default(null),
});

/** Construct one client per organization/platform worker, using that worker's
 * credential. The database derives its tenant and agent; no caller-supplied
 * organization ID or agent ID is accepted by this interface. */
export function createAgentMemoryClient(settings: WorkerSettings) {
  const url = new URL(settings.databaseUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("A secure database URL is required.");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !settings.publishableKey ||
    settings.agentToken.length < 32
  ) {
    throw new Error("Configure this worker's database connection and private agent credential.");
  }
  async function rpc<T = unknown>(name: string, parameters: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await (settings.fetcher ?? fetch)(new URL(`/rest/v1/rpc/${name}`, url), {
        method: "POST",
        headers: { apikey: settings.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...parameters, agent_token: settings.agentToken }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("The agent knowledge service could not be reached.");
    }
    // Never log request bodies, tokens, or provider diagnostics. A retry of a
    // discovery must reuse its original idempotency_key to avoid duplicate rows.
    if (!response.ok)
      throw new Error(
        `Agent knowledge request failed (${response.status}). Check its credential, pause state, and input.`,
      );
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  return {
    async collectVendor(discovery: z.infer<typeof discoverySchema>) {
      return rpc<{
        vendor_id: string;
        discovery_id: string;
        replayed: boolean;
        possible_duplicate_ids: string[];
      }>("collect_agent_vendor", { discovery: discoverySchema.parse(discovery) });
    },
    async remember(entry: z.input<typeof memorySchema>) {
      const parsed = memorySchema.parse(entry);
      return rpc<string>("remember_agent", {
        entry_key: parsed.key,
        entry_kind: parsed.kind,
        entry_content: parsed.content,
        entry_source: parsed.source,
        expiry: parsed.expiresAt,
      });
    },
    recall(searchText = "", offset = 0) {
      return rpc("recall_agent_context", {
        search_text: searchText.slice(0, 200),
        page_offset: offset,
      });
    },
    searchVendors(searchText = "", serviceArea = "", offset = 0) {
      return rpc("search_agent_vendors", {
        search_text: searchText.slice(0, 200),
        service_area: serviceArea.slice(0, 160),
        page_offset: offset,
      });
    },
    claimWork() {
      return rpc<null | {
        id: string;
        objective: string;
        lease_id: string;
        lease_until: string;
        attempts: number;
      }>("claim_agent_work", {});
    },
    finishWork(taskId: string, leaseId: string, succeeded: boolean, outcome: string) {
      return rpc<void>("finish_agent_work", {
        task_id: z.string().uuid().parse(taskId),
        task_lease: z.string().uuid().parse(leaseId),
        succeeded,
        outcome: z.string().max(12000).parse(outcome),
      });
    },
  };
}
