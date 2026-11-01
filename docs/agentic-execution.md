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
