# Perplexity research integration

CiviMeet uses Perplexity's current Agent API (`POST https://api.perplexity.ai/v1/agent`), with `effort: fast` for web research, a 2,000 output-token limit and a three-tool-call limit. It does not use the legacy Sonar chat completions integration. See the [official API quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart).

## Configure

1. Create an API key and configure billing in the [Perplexity API console](https://www.perplexity.ai/account/api/keys).
2. Add `PERPLEXITY_API_KEY` to the **server runtime secrets** for your deployment. Never prefix it with `VITE_`, put it in browser code, or paste it into chat.
3. Generate a separate private operator token using `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`. Store it securely as `CIVIMEET_RESEARCH_TOKEN` in server secrets. It must contain at least 32 characters. Do not reuse the Perplexity key.
4. For local development, copy `.env.example` to `.env.local`, fill in both values, and run `node --env-file=.env.local node_modules/vite/bin/vite.js dev` with Node 22 or later. This loads server secrets into the process environment explicitly. For production use your host's runtime secrets and restart/redeploy after configuration. For a standalone Node build, export the variables in the process environment. For a Cloudflare deployment, ensure the runtime exposes secret bindings through Node-compatible `process.env`.
5. Open `/agent` (also linked as **Research Preview** in the footer). Enter the operator token and submit a public research question. The Perplexity key never goes to the client. A configuration check means secrets are present, not that the provider connection has been verified. The first successful research response verifies it.

## What works

- Research community resources, venues, vendors, gathering ideas, or a general public question with an optional location.
- Display the actual answer, numbered search sources, timestamp, model, and reported tokens/cost. Missing cost is shown as unknown, never zero.
- Server-side validation, bounded request body, safe HTTP(S) source links, a 90-second timeout, and sanitized failure messages.
- The server-only `researchCommunity` adapter can be called by future authorized organizer jobs. API route: `GET /api/agent/research` reports setup status; `POST` accepts the research input with `Authorization: Bearer <operator token>`.

## Current scope

The `/agent` route remains a **single-operator research preview**, protected by a shared access token. The signed-in `/dashboard` now provides organization-scoped research with persistent results and durable usage limits; see [the dashboard integration](steward-dashboard.md). The preview token stays in React memory and is not persisted in local/session storage. Use HTTPS outside localhost; anyone with the operator token can use the configured API budget. Rotate it by updating the server secret.

Each preview server instance permits one concurrent request and five submissions per minute. These preview limits reset on restart and are not shared across instances. Customer research uses the authenticated dashboard endpoint with database-enforced per-organization limits. Do not treat the operator preview as a multi-tenant agent runtime.

Only the submitted question, purpose, and location are sent to Perplexity. `store: false` is requested; this is not a guarantee about provider retention policies. No automatic retries incur extra costs. Results are not saved to community memory, and nothing is posted, booked, sent, scheduled, or paid for.

## Validation

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. Tests mock the provider; they do not spend API credits. A live end-to-end request still requires configured credentials and API credits.
