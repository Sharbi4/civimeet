import "@tanstack/react-start/server-only";

// Meta Model API client for computer use (https://dev.meta.ai/docs/computer-use).
// POST /v1/responses with tools [{type:"computer"}]; the model returns one computer_call with
// batched actions; each turn sends a computer_call_output with a fresh screenshot. The key is
// read only on the server (MUSE_API_KEY, or META_MODEL_API_KEY) and never sent to clients,
// prompts or logs.
export const MUSE_ENDPOINT = "https://api.meta.ai/v1/responses";
export const museModels = ["muse-wonder-1.0", "muse-spark-1.3"] as const;
export type MuseModel = (typeof museModels)[number];

// Standard (non-training) pricing per 1M tokens. Muse Wonder is Standard-only on Model API.
const pricing: Record<MuseModel, { input: number; cached: number; output: number }> = {
  "muse-wonder-1.0": { input: 4, cached: 0.2, output: 20 },
  "muse-spark-1.3": { input: 1.25, cached: 0.15, output: 4.25 },
};

export type ComputerAction =
  | {
      type: "click";
      x: number;
      y: number;
      button?: "left" | "right" | "wheel" | "back" | "forward";
    }
  | { type: "double_click"; x: number; y: number }
  | { type: "drag"; path: { x: number; y: number }[] }
  | { type: "keypress"; keys: string[] }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: "type"; text: string }
  | { type: "screenshot" }
  | { type: "wait" };
export type SafetyCheck = { id: string; code: string | null; message: string | null };
export type ComputerCall = {
  call_id: string;
  actions: ComputerAction[];
  pending_safety_checks: SafetyCheck[];
  meta_safety_replay_receipt?: string;
};
export type MuseUsage = {
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  cost_usd: number;
};
export type MuseTurn = {
  id: string;
  call: ComputerCall | null;
  message: string;
  usage: MuseUsage;
};
export class MuseError extends Error {
  status: number;
  retryable: boolean;
  constructor(status: number, message: string, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export function museModel(env: Record<string, string | undefined> = process.env): MuseModel {
  const configured = env["META_COMPUTER_USE_MODEL"]?.trim();
  return (museModels as readonly string[]).includes(configured ?? "")
    ? (configured as MuseModel)
    : "muse-wonder-1.0";
}
/** The Meta Model API key: MUSE_API_KEY as configured in Lovable Cloud, or META_MODEL_API_KEY. */
export function museKey(env: Record<string, string | undefined> = process.env) {
  return env["MUSE_API_KEY"]?.trim() || env["META_MODEL_API_KEY"]?.trim() || "";
}
export function museConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(museKey(env));
}

function errorFor(status: number, body: { error?: { code?: string | null; message?: string } }) {
  const code = body.error?.code ?? "";
  if (status === 401)
    return new MuseError(
      401,
      "Meta rejected the API key. Check MUSE_API_KEY in the server secrets.",
    );
  if (status === 402)
    return new MuseError(402, "Meta Model API billing isn't set up for this account yet.");
  if (status === 403)
    return new MuseError(403, "This Meta API key doesn't have access to computer use.");
  if (status === 404 && code === "model_not_found")
    return new MuseError(404, "This Meta account can't use the selected Muse model.");
  if (status === 429)
    return new MuseError(
      429,
      "Meta's rate limit was reached. The agent will try again shortly.",
      true,
    );
  if (status === 413) return new MuseError(413, "The screenshot was too large for Meta to accept.");
  if (status >= 500)
    return new MuseError(
      status,
      "Meta's computer-use service is busy. The agent will try again.",
      true,
    );
  return new MuseError(status, "Meta could not process this browser step.");
}

function parseTurn(raw: Record<string, unknown>, model: MuseModel): MuseTurn {
  const output = Array.isArray(raw["output"]) ? (raw["output"] as Record<string, unknown>[]) : [];
  const callItem = output.find((item) => item["type"] === "computer_call");
  let call: ComputerCall | null = null;
  if (callItem && typeof callItem["call_id"] === "string") {
    const batch = Array.isArray(callItem["actions"])
      ? (callItem["actions"] as ComputerAction[])
      : callItem["action"]
        ? [callItem["action"] as ComputerAction]
        : [];
    call = {
      call_id: callItem["call_id"] as string,
      actions: batch
        .filter((action) => action && typeof action === "object" && typeof action.type === "string")
        .slice(0, 12),
      pending_safety_checks: Array.isArray(callItem["pending_safety_checks"])
        ? (callItem["pending_safety_checks"] as SafetyCheck[])
            .filter((check) => check && typeof check.id === "string")
            .map((check) => ({
              id: check.id,
              code: check.code ?? null,
              message: check.message ?? null,
            }))
        : [],
      ...(typeof callItem["meta_safety_replay_receipt"] === "string"
        ? { meta_safety_replay_receipt: callItem["meta_safety_replay_receipt"] as string }
        : {}),
    };
  }
  const message = output
    .filter((item) => item["type"] === "message")
    .flatMap((item) =>
      Array.isArray(item["content"]) ? (item["content"] as Record<string, unknown>[]) : [],
    )
    .map((part) =>
      part["type"] === "output_text"
        ? String(part["text"] ?? "")
        : part["type"] === "refusal"
          ? String(part["refusal"] ?? "")
          : "",
    )
    .join("\n")
    .trim();
  const usage = (raw["usage"] ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  const input = usage.input_tokens ?? 0;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  const price = pricing[model];
  return {
    id: String(raw["id"] ?? ""),
    call,
    message,
    usage: {
      input_tokens: input,
      cached_tokens: cached,
      output_tokens: out,
      cost_usd: Number(
        (
          ((input - cached) * price.input + cached * price.cached + out * price.output) /
          1_000_000
        ).toFixed(6),
      ),
    },
  };
}

export type MuseRequest =
  | { kind: "start"; instructions: string; task: string; screenshot: string }
  | {
      kind: "continue";
      instructions: string;
      previousResponseId: string;
      callId: string;
      screenshot: string;
      acknowledged: SafetyCheck[];
      note?: string | undefined;
    };

/** One computer-use turn, with bounded retries for transient failures. */
export async function museTurn(
  request: MuseRequest,
  options: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    retries?: number;
  } = {},
): Promise<MuseTurn> {
  const env = options.env ?? process.env;
  const key = museKey(env);
  if (!key)
    throw new MuseError(
      503,
      "Muse Wonder isn't set up yet. Add MUSE_API_KEY to the server secrets.",
    );
  const model = museModel(env);
  const body =
    request.kind === "start"
      ? {
          model,
          instructions: request.instructions,
          tools: [{ type: "computer" }],
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: request.task },
                { type: "input_image", image_url: request.screenshot },
              ],
            },
          ],
        }
      : {
          model,
          // Instructions are not carried forward with previous_response_id, so send them every turn.
          instructions: request.instructions,
          previous_response_id: request.previousResponseId,
          tools: [{ type: "computer" }],
          input: [
            {
              type: "computer_call_output",
              call_id: request.callId,
              acknowledged_safety_checks: request.acknowledged,
              output: { type: "computer_screenshot", image_url: request.screenshot },
            },
            ...(request.note
              ? [{ role: "user", content: [{ type: "input_text", text: request.note }] }]
              : []),
          ],
        };
  const retries = options.retries ?? 2;
  let last: MuseError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await (options.fetcher ?? fetch)(MUSE_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(75_000),
        redirect: "error",
      });
    } catch {
      last = new MuseError(504, "Meta didn't respond in time. The agent will try again.", true);
      continue;
    }
    // Error bodies can echo submitted content; only their code is used, never logged.
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return parseTurn(payload, model);
    last = errorFor(response.status, payload as { error?: { code?: string | null } });
    if (!last.retryable) throw last;
    await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 800 * 2 ** attempt)));
  }
  throw last ?? new MuseError(502, "Meta could not process this browser step.");
}
