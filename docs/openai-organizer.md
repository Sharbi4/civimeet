# Managed community organizer

## Architecture and current scope

The existing TanStack Start/React application, Supabase authentication, organization briefs, vendor directory, event records, Perplexity research and Steel browser are preserved. `/dashboard` is the authenticated workspace; `/demo` contains labeled sample data.

`ManagedOrganizer.tsx` uses authenticated `POST /api/organizer`. The server validates membership and editor role before resolving any provider session. It uses the official OpenAI SDK's `beta.agents.sessions` APIs, subscribes before submitting input, streams selected text/activity events, retrieves saved provider messages after refresh, and submits explicit cancellation events. Provider session IDs cannot be supplied by callers. API credentials never reach the browser or the hosted environment.

`organizer_sessions` associates conversations with organizations and chat threads. `organizer_submissions` records request identity and applies a 30-message rolling daily organization limit. Database leases prevent concurrent submissions; identical submission retries do not create new turns. Sessions have a configurable provider spend cap. Token usage and provider-reported spend are shown separately from organizational event budgets.

The organizer starts with organization reference data and has two allowlisted function tools: `organization_context` retrieves current saved information; `research_local` invokes the existing authenticated Perplexity research handler and persists sourced vendor candidates, draft proposals and knowledge using the existing transaction. Tool execution rechecks membership. Tool call IDs produce stable research request IDs. The selected public-web agent must be enabled and unpaused.

OpenAI's hosted environment currently has network access disabled and only those application function tools are configured. Computer-use, sign-in, vault credentials and outbound actions are **not enabled**. Existing Steel public-page browsing remains available separately. No social post, message, booking or payment is executed by this implementation. Sending an answer to the existing approval editor prepares a draft; approval does not secretly dispatch it.

An event can also queue a two-task Perplexity sequence: community research followed by vendor discovery, both tied to its saved geographic area. Each task has a lease, dependency, retry limit and saved agent-memory checkpoint. This sequence advances while the workspace is open; it is not a deployed recurring background worker.

## Configuration

Apply `202610310005_agent_work_runner.sql` and `202611090001_managed_organizer.sql`.

Server secrets:

- `OPENAI_ORGANIZER_ENABLED=true`
- `OPENAI_API_KEY`, with Agents read/write and Responses write permissions
- `OPENAI_ORGANIZER_MODEL`, a model supported by the project's Agents API
- `OPENAI_ORGANIZER_TIMEOUT_MS` (15,000–180,000; default 120,000)
- `OPENAI_ORGANIZER_SESSION_CENTS` (1–10,000; default 200, provider best-effort cap)
- Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PERPLEXITY_API_KEY`

No key or disabled flag produces a configuration-required state, never a simulated reply. Hosted browser execution is deliberately unavailable pending separate permission/authentication integration and testing. No browser flag falsely advertises a working integration.

## Demonstration

1. Open `/dashboard`, sign up/sign in, and create your organization workspace.
2. In Identity, save the actual mission, geographic area, audience, voice, platforms and event goal. For an investor demonstration, explicitly name the organization as a demo and use fictional organizational details.
3. Ensure the public-web research agent is selected and not paused in Connections/Platform Agents.
4. Open Organizer Chat and ask: “We want to get more families involved in our community.” The response should reflect the saved brief.
5. Ask: “Research venues and vendors for a neighborhood resource fair for 100 people in Tucson. Save sourced candidates and prepare a proposal.” Real research requires Perplexity configuration and available quota.
6. Inspect saved vendor candidates, research sources and draft proposals. Candidates are not verified bookings.
7. Use “Prepare for review” to open an exact draft in the approval editor. Approve/reject through the existing review flow; no external communications are sent.
8. Start a new conversation and ask what venues/vendors were found. The context tool retrieves persisted organization research rather than relying solely on the previous OpenAI session.
9. During a task, use Stop task. A stop request is shown as pending until the provider confirms the outcome. If disconnected, Refresh saved work and Continue/Reconnect retrieve the existing session.

## Limits and next milestone

Priority 1 is implemented in code; production provider execution must be verified with the configured project's actual credentials. Existing onboarding and memory are reused, but a structured, revisioned administrator-approved Mission Playbook is not yet implemented. Playbook text generated in chat is a proposal, not an approved operating policy.

Research saves candidates through Perplexity; OpenAI-hosted browser research is not yet enabled. Secure platform OAuth/vault connections, browser origin approvals, credential-entry UI, authenticated social execution, payment execution, attendance reporting, memory deletion controls and durable background tool workers remain separate milestones. An interrupted session creation with an unknown provider outcome needs operator review; it is not retried blindly. Closing a chat may leave the provider waiting for application tool results until Resume.

Provider history retains conversation content; organization membership controls application access. Deleting organization rows does not yet delete provider sessions, so retention cleanup must be added before a broader pilot. Do not enter passwords or verification codes into chat.

## Verification

Automated server tests cover authorization, caller-supplied session rejection, real stream event handling, subscribe-before-send ordering, cancellation, replay protection, bounded configuration, scoped tool arguments, unknown-tool denial, and size/origin checks. SQL rollback tests cover tenant isolation, client write denial, server-only reservation, concurrency, idempotency and daily quota. Research task tests cover leases, dependencies, recovery, pause state and checkpoints. Live results are recorded separately after deployment.

## Official API references

- https://developers.openai.com/api/docs/guides/agents-api/overview
- https://developers.openai.com/api/docs/guides/agents-api/sessions
- https://developers.openai.com/api/docs/guides/agents-api/sessions/events
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
- https://developers.openai.com/api/docs/guides/agents-api/tools/vaults
