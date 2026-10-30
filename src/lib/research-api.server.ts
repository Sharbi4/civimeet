import "@tanstack/react-start/server-only";
import { timingSafeEqual } from "node:crypto";
import { researchInputSchema } from "./research";
import { ResearchError, researchCommunity } from "./perplexity.server";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function researchStatus(): Response {
  return json({
    configured: Boolean(process.env["PERPLEXITY_API_KEY"]?.trim()),
    accessConfigured: (process.env["CIVIMEET_RESEARCH_TOKEN"]?.trim().length ?? 0) >= 32,
  });
}

// Single-operator preview only. Replace with organization membership and durable
// tenant quotas before enabling research for customer accounts / multiple workers.
let windowStarted = 0;
let requestsInWindow = 0;
let inFlight = false;

export async function handleResearch(request: Request): Promise<Response> {
  const expected = process.env["CIVIMEET_RESEARCH_TOKEN"]?.trim();
  if (!expected || expected.length < 32)
    return json({ error: "Private research access is not configured on the server." }, 503);
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return json({ error: "Enter a valid private research access token." }, 401);
  }
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-site research requests are not allowed." }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    return json({ error: "Send the research request as JSON." }, 415);
  }
  // Limit the actual stream, not just the caller-controlled Content-Length.
  let body = "";
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "A research request is required." }, 400);
  try {
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return json({ error: "The research request is too large." }, 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    return json({ error: "Could not read the research request." }, 400);
  } finally {
    reader.releaseLock();
  }
  let input;
  try {
    input = researchInputSchema.parse(JSON.parse(body));
  } catch {
    return json(
      {
        error:
          "Provide a question of 10–3000 characters, a valid purpose, and a location up to 160 characters.",
      },
      400,
    );
  }
  const now = Date.now();
  if (now - windowStarted >= 60_000) {
    windowStarted = now;
    requestsInWindow = 0;
  }
  if (inFlight || requestsInWindow >= 5)
    return json({ error: "Research is busy. Wait a minute before another request." }, 429);
  requestsInWindow++;
  inFlight = true;
  try {
    return json(await researchCommunity(input, { signal: request.signal }));
  } catch (error) {
    return error instanceof ResearchError
      ? json({ error: error.message }, error.status)
      : json({ error: "Research could not be completed. Try again." }, 500);
  } finally {
    inFlight = false;
  }
}
