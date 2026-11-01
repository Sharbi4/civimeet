# Agentic execution: audit and architecture

_Last audit: 2026-11-01. "Verified" means exercised against the live Lovable Cloud database or provider; "unit-tested" means covered by automated tests with mocked providers; anything else is called out._

## What actually works today

| Capability                                                                                                                                                           | Status                  | Evidence                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts, organizations, roles, row-level security                                                                                                                   | Working                 | Existing migrations and SQL tests                                                                                                                   |
| Perplexity research (`/v1/agent`, model `openai/gpt-6-sol`)                                                                                                          | **Verified**            | Live 200 with search results; production runs completed with sources                                                                                |
| Civi conversation (personality, platform roles, event intake questions)                                                                                              | Unit-tested             | Conversation instructions, event-detail extraction, routing tests; first live conversation pending                                                  |
| **Plans and tasks** (goal → durable steps with dependencies, levels, leases)                                                                                         | **Verified (database)** | Rolled-back live transaction: viewer blocked, server-decided levels, dependency gating, single lease, blocked step not stalling others, retry, stop |
| **Task runner** (`/api/agent/run`) executing research, venue/vendor research, drafts → Approvals, event creation, connection checks, approval-gated platform actions | Unit-tested             | `src/test/agent-runner.test.ts`; first live run happens from a signed-in workspace                                                                  |
| Approvals (record decisions, revision history)                                                                                                                       | Working                 | Existing; waiting plan steps now move on when a decision is made                                                                                    |
| Events (create, budget, geography)                                                                                                                                   | Working                 | Existing RPC; runner creates events only when details are complete                                                                                  |
| Steel browser, public websites (start, navigate, scroll, screenshots, admin-approved sites)                                                                          | Working                 | 18 recorded live actions; agent can open cited pages there                                                                                          |
| Connections (status list, live sign-in, encrypted saved logins, OAuth)                                                                                               | Unit-tested             | Database checks verified live; no real platform sign-in yet; OAuth apps not registered                                                              |
| Platform agent memory (notes loaded into conversations, saved after chats and tasks)                                                                                 | Unit-tested             | Memory table live; notes written by chat and runner                                                                                                 |
| ElevenLabs voice                                                                                                                                                     | Isolated by design      | Preparation-only agent; not connected to plans (see "Voice" below)                                                                                  |

## Chat to action

Organizer Chat routes every message before anything reaches Perplexity (`src/lib/chat-intents.ts`):

| Instruction (examples)                                                         | Tool                                                                                                            | Notes                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Open Facebook", "Start browser and log in to Facebook", "Connect my LinkedIn" | Connector `browser_start` (not connected) or `browser_open` (connected); `oauth_start` for OAuth-only platforms | Owner/admin only (checked in the dashboard and again by the server). The live browser opens in the agent panel; the person signs in there. Success is reported only after `browser_finish` confirms the connection; the rest of the request ("…and find local groups") is kept and offered afterwards. |
| "Open the browser"                                                             | Agent panel browser                                                                                             |                                                                                                                                                                                                                                                                                                        |
| "Show me what my Instagram agent is doing"                                     | Platform agent chat + activity                                                                                  | Explains when the platform isn't connected                                                                                                                                                                                                                                                             |
| "Pause the Facebook agent", "Pause all agents"                                 | `configure_platform_agent` / `control_agent_plan`                                                               | Admin / editor permissions enforced by the database                                                                                                                                                                                                                                                    |
| "Show my pending approvals", "Show my connections"                             | Panel approvals / Connections                                                                                   |                                                                                                                                                                                                                                                                                                        |
| Anything else (questions, research, planning)                                  | Civi conversation (Perplexity)                                                                                  | Civi is told which tools exist and which accounts are connected; it can request a tool with `<civi_action>`, which runs through the same executor                                                                                                                                                      |

Every action and its real outcome is stored in `organizer_chat_actions` and shown in the thread, and recent actions are given to Civi so the conversation continues after sign-in. Passwords never pass through chat or the model.

## Computer use: Muse + Steel

**Muse decides, Steel runs the browser, Civi enforces permissions** (`src/lib/muse.server.ts`, `src/lib/browser-agent.server.ts`, `src/lib/browser-agent-policy.ts`, `/api/agent/browser`).

- One verified step per request: reconnect the platform's own Steel profile if needed → if the page is a sign-in or verification page, hand control to a person → screenshot (viewport, CSS-pixel scale) → Meta Responses API with the `computer` tool (`computer_call_output` + fresh screenshot each turn, chained with `previous_response_id`, instructions re-sent) → check every proposed action against what is actually under the cursor or focused → run allowed actions as CDP input events in the Steel session → record events.
- CDP is what Playwright sends under the hood; Playwright itself can't run on the Cloudflare Workers runtime, so the existing Steel CDP connection is reused.
- **Read-only mode** (the only mode): look, scroll, open links, tabs and menus within the platform, and type into search boxes. Posting, commenting, reacting, messaging, sharing, joining, following, submitting forms, typing elsewhere, drags, context menus, keyboard shortcuts and links that leave the platform are refused before they happen, and the model is told why. Social sites are only browsed through their own connection (never the public-web browser).
- Meta `pending_safety_checks` stop the run until a person chooses **Allow and continue** (acknowledged exactly once, on the next turn; Civi's own policy still applies) or **Stop**. While it waits, the run view shows what the agent wants to do (for example "Click … (“Events”)") and whether Civi's read-only policy would block it anyway. Meta refuses to continue a run until every pending check is acknowledged, so a declined check ends the run.
- Step limit 12, one live run per platform, 40 runs per organization per day; pause, resume, stop, take control and hand back between steps; a failed step closes the browser and records the real error.
- Runs and step events are stored (screenshots never are); a verified result is tied to the page the browser actually ended on and saved to the platform agent's memory; Civi sees the last 7 days of runs when asked what an agent did.
- Model: `muse-wonder-1.0` first, falling back to `muse-spark-1.3` for a new run when Meta refuses computer use for Wonder; the switch is recorded in the run. Usage and cost (Standard pricing) are logged per run.
- Key: `MUSE_API_KEY` (or `META_MODEL_API_KEY`), server-side only.

**Live check (2026-11-01, after Meta billing was set up)**, run read-only from the Lovable sandbox with the real keys:

| Call                                                                     | Result                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Muse Wonder, plain text                                                  | 200, replied "OK". Billing works.                                                                                                                                                            |
| Muse Wonder + `computer` tool                                            | 400 `Unsupported tool type: 'computer'`. Wonder still doesn't offer computer use on this team, so runs use Spark 1.3.                                                                        |
| Muse Spark 1.3 + `computer` tool (1280×800 test image, "click Continue") | 200: one `computer_call` with an `actions` array: `click` at 640, 431 (inside the button). One safety check: `computer_action_requires_confirmation`. About 3.4k input / 0.4k output tokens. |
| Follow-up turn without acknowledging the check                           | 400 `Every pending computer safety check must be acknowledged exactly once`. This confirms the harness must stop for a person; it now explains this error in plain words.                    |
| Steel screenshot of example.com → Spark 1.3                              | Steel 200. Spark returned a `computer_call` asking for a `screenshot` (no safety check). The instructions now tell the model that a fresh screenshot arrives every turn.                     |

Expect Meta to ask for confirmation on ordinary clicks, so a read-only run will often pause for **Allow and continue**. Not yet run end to end: a real signed-in platform run (needs the published app and a connected account).

## What does not exist yet (do not assume a button means it works)

- **Posting, commenting, joining groups, messaging, creating groups on any platform.** Plans can prepare and approve these, but no executor performs them. After approval the step says so plainly ("Approved. Automatic publishing isn't switched on yet").
- **Background execution without an open workspace.** The runner advances while an editor has the workspace open. A scheduled runner is the next step (pg_cron and pg_net are available but not installed).
- **Vendor records from plan steps.** `find_vendors` returns sourced candidates; it does not yet save them to the vendor directory (the chat's local-discovery flow does).
- **Apify, Stripe, Plaid, outbound calls.** Not integrated.
- **Per-organization autonomy settings.** Levels are fixed: research and prepare run automatically; communicate and commit always wait for a person.

## Architecture

```
Chat message (Main Agent or platform agent)
  → /api/research (steward research) with skill "conversation"
      Civi personality + platform role + organization brief + memory + active plans
      → reply, event details, or a <civi_plan> proposal (validated against a fixed step catalog)
  → create_agent_plan (service role): agent_plans + agent_tasks
      level decided by the database from the step kind, never by the model
  → workspace runner loop → /api/agent/run (editor session)
      settle waiting approvals → claim_agent_task (lease, dependencies, daily research cap)
      → executeTask: Perplexity research | Perplexity draft → organizer_approvals |
        community_events | connection check | approval-gated platform action
      → finish_agent_task (lease-checked, verified outcome) → realtime → plan card + agent panel
```

### Step catalog and honesty rules

| Kind               | Level       | Done means                                                                                                                        |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `research`         | Research    | Sourced findings saved to knowledge (and the platform agent's memory)                                                             |
| `find_venues`      | Research    | Venue options compared with sources. **Nothing is booked.**                                                                       |
| `find_vendors`     | Research    | Candidates with sources. **Nobody has been contacted.**                                                                           |
| `draft_content`    | Prepare     | Draft saved in Approvals. **Not published.**                                                                                      |
| `create_event`     | Prepare     | Draft event record exists (blocked until date, place, size and purpose are known)                                                 |
| `connect_platform` | Prepare     | The account is connected (otherwise blocked with a Connect link)                                                                  |
| `platform_action`  | Communicate | Never "done" by the runner today: blocked until connected, then waits for approval, then reports that publishing is not automated |

### Safety properties

- Only the server (service role) can create, claim or finish tasks; members can read; editors can pause, resume, stop and retry.
- Every claim takes a 150-second lease; a step can only be finished with its lease; interrupted steps retry up to three times, then fail visibly.
- One step runs per plan at a time; at most five active plans per organization; at most 30 research steps per organization per 24 hours.
- Web content and model output are data: plans are validated against the catalog, dependencies are sanitized, levels come from the database.
- Credentials never enter model context or logs (connectors keep them sealed server-side).

## Voice

The project rule keeps the hosted ElevenLabs agent isolated from organization memory, approvals and outbound tools. The safe path to "voice enters the same orchestration" is client-side: send the finished voice transcript into the same chat endpoint, so the hosted agent never gains those tools. Not built yet.

## Recommended next steps (smallest reliable sequence)

1. **First live run.** From a signed-in workspace, give Civi a goal ("start a community for single parents in Tucson, from scratch") and watch the plan run; fix whatever the real model output surfaces.
2. **Scheduled runner.** Install pg_cron + pg_net and call a service-authenticated run endpoint every minute so plans advance without an open tab.
3. **Vendor records from plans.** Route `find_vendors` through local discovery so candidates land in the vendor directory with sources.
4. **First real executor.** Publish an approved post to an officially connected Facebook Page (Pages API, after Meta app review), then browser-based execution for groups with take-over.
5. **Autonomy settings** per organization, and **voice transcripts** into chat.
