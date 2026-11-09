import "@tanstack/react-start/server-only";

// Meta Model API client for computer use (https://dev.meta.ai/docs/computer-use).
// POST /v1/responses with tools [{type:"computer"}]; the model returns one computer_call with
// batched actions; each turn sends a computer_call_output with a fresh screenshot. The key is
// read only on the server (MUSE_API_KEY, or META_MODEL_API_KEY) and never sent to clients,
// prompts or logs.
//
// ChatGPT (OpenAI Responses API) offers the same computer tool and turn shape, so the browser
// agent runs on OpenAI whenever OPENAI_API_KEY is configured and falls back to Muse otherwise.
export const MUSE_ENDPOINT = "https://api.meta.ai/v1/responses";
export const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
export const openaiComputerModels = ["gpt-5.5", "gpt-5.4", "gpt-6-sol"] as const;
export const museModels = [...openaiComputerModels, "muse-wonder-1.0", "muse-spark-1.3"] as const;
export type MuseModel = (typeof museModels)[number];
export const isOpenAIModel = (model: string) =>
  (openaiComputerModels as readonly string[]).includes(model);

// Per 1M tokens. OpenAI figures are planning estimates for the run cost display only.
const pricing: Record<MuseModel, { input: number; cached: number; output: number }> = {
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
  "gpt-6-sol": { input: 5, cached: 0.5, output: 30 },
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
  /** The model that actually produced this turn. */
  model: MuseModel;
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

const openaiKey = (env: Record<string, string | undefined>) => env["OPENAI_API_KEY"]?.trim() || "";
/** ChatGPT drives the browser when an OpenAI key is configured; Muse remains the fallback. */
export function museModel(env: Record<string, string | undefined> = process.env): MuseModel {
  if (openaiKey(env)) {
    const configured = env["OPENAI_COMPUTER_USE_MODEL"]?.trim();
    return isOpenAIModel(configured ?? "") ? (configured as MuseModel) : "gpt-5.5";
  }
  const configured = env["META_COMPUTER_USE_MODEL"]?.trim();
  return (museModels as readonly string[]).includes(configured ?? "") &&
    !isOpenAIModel(configured ?? "")
    ? (configured as MuseModel)
    : "muse-wonder-1.0";
}
/** The Meta Model API key: MUSE_API_KEY as configured in Lovable Cloud, or META_MODEL_API_KEY. */
export function museKey(env: Record<string, string | undefined> = process.env) {
  return env["MUSE_API_KEY"]?.trim() || env["META_MODEL_API_KEY"]?.trim() || "";
}
/** The key for a model's provider. */
export function computerKey(model: MuseModel, env: Record<string, string | undefined> = process.env) {
  return isOpenAIModel(model) ? openaiKey(env) : museKey(env);
}
export function computerProviderName(model: string) {
  return isOpenAIModel(model) ? "ChatGPT" : "Meta Muse";
}
export function museConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(openaiKey(env) || museKey(env));
}

/** Meta rejects the computer tool for a model that doesn't offer computer use on this account. */
export class ComputerToolUnsupported extends Error {}
function errorFor(
  status: number,
  body: { error?: { code?: string | null; message?: string } },
  model: MuseModel,
) {
  const code = body.error?.code ?? "";
  if (isOpenAIModel(model)) {
    if (status === 401)
      return new MuseError(401, "OpenAI rejected the API key. Check OPENAI_API_KEY in the server secrets.");
    if (status === 429 && /quota|billing/i.test(body.error?.message ?? ""))
      return new MuseError(402, "The OpenAI account is out of credit. Add billing at platform.openai.com, then try again.");
    if (status === 429)
      return new MuseError(429, "OpenAI's rate limit was reached. The agent will try again shortly.", true);
    if (status === 404 || code === "model_not_found")
      return new MuseError(404, "This OpenAI account can't use the selected computer-use model.");
    if (status >= 500)
      return new MuseError(status, "ChatGPT's computer-use service is busy. The agent will try again.", true);
    if (status === 400 && /safety check/i.test(body.error?.message ?? ""))
      return new MuseError(400, "ChatGPT won't continue until a person decides on the flagged step. Start the task again.");
    return new MuseError(status, "ChatGPT could not process this browser step.");
  }
  if (status === 400 && /unsupported tool type:\s*'?computer'?/i.test(body.error?.message ?? ""))
    return new ComputerToolUnsupported(
      "This Muse model doesn't accept computer use on this account.",
    );
  if (status === 400 && /safety check must be acknowledged/i.test(body.error?.message ?? ""))
    return new MuseError(
      400,
      "Meta won't continue until a person decides on the flagged step. Start the task again.",
    );
  if (status === 401)
    return new MuseError(
      401,
      "Meta rejected the API key. Check MUSE_API_KEY in the server secrets.",
    );
  if (status === 402)
    return new MuseError(
      402,
      "Meta Model API billing isn't set up for this team yet. Resolve it at dev.meta.ai/billing, then try again.",
    );
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
    model,
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
    /** Model for this run (a run stays on one model so its response chain is consistent). */
    model?: MuseModel | undefined;
  } = {},
): Promise<MuseTurn> {
  const env = options.env ?? process.env;
  const preferred = options.model ?? museModel(env);
  const key = computerKey(preferred, env);
  if (!key)
    throw new MuseError(
      503,
      isOpenAIModel(preferred)
        ? "ChatGPT browser use isn't set up yet. Add OPENAI_API_KEY to the server secrets."
        : "Muse Wonder isn't set up yet. Add MUSE_API_KEY to the server secrets.",
    );
  try {
    return await museRequest(request, preferred, key, options);
  } catch (failure) {
    // Muse Wonder is in preview; if Meta doesn't offer it computer use on this account yet, a new
    // run falls back to Muse Spark 1.3 (documented for the same loop). The turn reports which
    // model actually ran, so nothing is attributed to Wonder that Wonder didn't do.
    if (
      failure instanceof ComputerToolUnsupported &&
      preferred === "muse-wonder-1.0" &&
      request.kind === "start"
    )
      return museRequest(request, "muse-spark-1.3", key, options);
    if (failure instanceof ComputerToolUnsupported)
      throw new MuseError(
        400,
        `${preferred} doesn't accept computer use on this Meta account yet.`,
      );
    throw failure;
  }
}

async function museRequest(
  request: MuseRequest,
  model: MuseModel,
  key: string,
  options: { fetcher?: typeof fetch; retries?: number },
): Promise<MuseTurn> {
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
      response = await (options.fetcher ?? fetch)(isOpenAIModel(model) ? OPENAI_ENDPOINT : MUSE_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(75_000),
        redirect: "error",
      });
    } catch {
      last = new MuseError(
        504,
        `${computerProviderName(model)} didn't respond in time. The agent will try again.`,
        true,
      );
      continue;
    }
    // Error bodies can echo submitted content; only their code is used, never logged.
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return parseTurn(payload, model);
    const failure = errorFor(
      response.status,
      payload as { error?: { code?: string | null; message?: string } },
      model,
    );
    if (failure instanceof ComputerToolUnsupported || !failure.retryable) throw failure;
    last = failure;
    await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 800 * 2 ** attempt)));
  }
  throw last ?? new MuseError(502, `${computerProviderName(model)} could not process this browser step.`);
}
