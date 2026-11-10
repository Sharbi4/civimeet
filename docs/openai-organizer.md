# Managed community organizer

## Architecture and current scope

The TanStack Start/React application, Supabase authentication, organization memory, vendor directory, event records and Perplexity research are preserved. All workspace conversations now use the managed OpenAI organizer, including isolated platform helper threads. Legacy Atlas/Steel/Muse browser controls and chat interception are retired; both browser execution endpoints return HTTP 410. Settings keeps encrypted saved logins and official OAuth connections. Saving credentials does not launch a browser or establish an OpenAI login. The workspace fits the viewport with internal conversation and settings scrolling.

`ManagedOrganizer.tsx` uses authenticated `POST /api/organizer`. The server validates membership and editor role before resolving any provider session. It uses the official OpenAI SDK's `beta.agents.sessions` APIs, subscribes before submitting input, streams selected text/activity events, retrieves saved provider messages after refresh, and submits explicit cancellation events. Provider session IDs cannot be supplied by callers. API credentials never reach the browser or the hosted environment.

`organizer_sessions` associates conversations with organizations and chat threads. `organizer_submissions` records request identity and applies a 100-message rolling daily organization limit (raised from 30 on 2026-11-09; reconnecting never counts). Database leases prevent concurrent submissions; identical submission retries do not create new turns. A provider spend cap is optional and disabled unless the project supports it; the live project rejected that newly documented API field. Application limits include 100 messages per organization per day, four tool calls per stream, a per-conversation token allowance checked before new messages, and a bounded stream timeout that requests cancellation. These are not a guaranteed dollar cap. Token usage and provider-reported spend are shown separately from organizational event budgets.

The organizer starts with organization reference data and has two allowlisted function tools: `organization_context` retrieves current saved information; `research_local` invokes the existing authenticated Perplexity research handler and persists sourced vendor candidates, draft proposals and knowledge using the existing transaction. Tool execution rechecks membership. Tool call IDs produce stable research request IDs. The selected public-web agent must be enabled and unpaused.

The customer-facing conversational agent uses `environment.type: "none"` and only those application function tools. It does not need a sandbox to chat or invoke research. Computer-use, sign-in, vault credentials and outbound actions are **not enabled**. Legacy Steel public-page browsing is disabled. OpenAI browser sign-in and human takeover are not yet implemented. No social post, message, booking or payment is executed by this implementation. Sending an answer to the existing approval editor prepares a draft; approval does not secretly dispatch it.

An event can also queue a two-task Perplexity sequence: community research followed by vendor discovery, both tied to its saved geographic area. Each task has a lease, dependency, retry limit and saved agent-memory checkpoint. This sequence advances while the workspace is open; it is not a deployed recurring background worker.

## Browser tools and reconnecting (2026-11-09)

- New conversations ask OpenAI for the best setup first: an OpenAI-hosted browser (`computer_use` with screenshots, `openai_hosted` environment with a small desktop container) plus live `web_search`. If the project rejects that setup (400/403/404/422), the next conversation setup is tried: web search only, then plain conversation, so the chat always works. The accepted level is remembered per server instance. `OPENAI_ORGANIZER_BROWSER=false` or `OPENAI_ORGANIZER_WEB_SEARCH=false` turns either off.
- The browser's network is `restricted` with social networks blocked (Facebook, Instagram, Threads, LinkedIn, X, TikTok, Nextdoor, Reddit). Site-access requests are answered by policy (`browserApproval`): public http(s) sites are approved; social networks, private addresses and other schemes are denied. Every sign-in request is declined: Civi never enters passwords or codes.
- Screenshots stream to the person's chat and are never stored.
- The live connection sends a keep-alive every 10 seconds while tools run. At the stream time limit (default 150 s) the connection ends cleanly and the chat reconnects; the task keeps running at OpenAI instead of being cancelled. The token allowance still bounds a conversation.
- Opening a conversation that is still running, or waiting on Civi's tools, resumes it automatically (up to four automatic reconnects in a row).
- Conversations start from the saved OpenAI agent `agent_6af2277a03308191aefbc871a7cb5318` (its model and multi-agent settings) with Civi's personality, function tools, web search and browser applied on top; set `OPENAI_ORGANIZER_AGENT_ID` to use another agent or `none` to skip it. If OpenAI rejects the saved agent, the same setup runs without it. That agent's own instructions are a build brief, so Civi's personality always overrides them.
- A new message always goes through: the message box shows even when saved work can't load, and Enter is never blocked by an old task. Sending while a task runs stops it (waiting up to 6 s for OpenAI to confirm); if it stays stuck, the conversation is set aside and the message is resent into a fresh one. `reset` does the same on request.
- Civi's browser is a panel pinned above the chat ("Live", "Starting…", "Ready", or "Web search only" when OpenAI didn't enable the hosted browser for that conversation). It shows the live screenshot while Civi browses and, after a reload, the last page from the conversation's history at OpenAI (never stored by CiviMeet). Civi is told to use the browser, not just web search, whenever someone asks to open or check a website.
- A conversation's token allowance defaults to 1,000,000 (`OPENAI_ORGANIZER_SESSION_TOKEN_LIMIT`, up to 5,000,000). When it is full, the next message continues in a fresh conversation automatically; Civi reloads the organization's saved context there.
- If the OpenAI account is out of credits (`insufficient_quota`), the chat says so and points to OpenAI billing instead of retrying or calling it "busy".
- Optional: an OpenAI dashboard environment template (Network access: Enabled; no packages, setup commands or environment variables; desktop/browser on). Put its ID in the server secret `OPENAI_ORGANIZER_ENVIRONMENT_TEMPLATE_ID`; conversations then start from it, and CiviMeet's settings only narrow it (social networks blocked). Not needed when the inline setup is accepted. Because the dashboard doesn't label which kind of ID it shows, that value is also tried as an existing environment (`environment_id`), or set `OPENAI_ORGANIZER_ENVIRONMENT_ID` for one explicitly. An existing environment is shared by every conversation that attaches it, so prefer a template for multiple organizations.
- Browserbase connected in the OpenAI dashboard is not used by CiviMeet yet. Conversations set their own tool list, which replaces tools saved on the agent; wiring Browserbase's MCP server in is a fallback to add only if OpenAI's hosted browser stays unavailable.
- Not live-verified yet: whether this OpenAI project accepts the hosted browser and web search. If it doesn't, the chat says so and continues with what it has.

## Civi's live browser (Browserbase)

Set the server secret `BROWSERBASE_API_KEY` (and optionally `BROWSERBASE_PROJECT_ID`) to give Civi a live browser the team watches and can take over. OpenAI's hosted browser has no live view or take-over, so with Browserbase configured Civi uses this browser instead (web search stays on).

- CiviMeet creates one Browserbase browser per conversation the first time Civi browses: 1280×800, ads blocked, CAPTCHA solving off, nothing recorded or logged, kept alive for up to 30 minutes (`keepAlive` needs a paid Browserbase plan; without it each step still works). It closes when the conversation is reset, started over or set aside.
- The CDP connect URL is stored only in `private.organizer_browsers`, reachable through service-role RPCs (`get/save/forget_organizer_browser`, `set_organizer_browser_control`). Members get only Browserbase's https live-view link, through the authorized organizer endpoint.
- Civi's tools: `browser_open`, `browser_read`, `browser_click`, `browser_search`, `browser_scroll`, `browser_back`. Each is checked before it runs (`browser-policy.ts`): public http(s) sites, social networks included (2026-11-10, founder decision); private addresses and sign-in details refused; clicks that would post, comment, like, share, join, follow, message, send, buy, donate, register, sign in or sign up refused; typing only into search boxes. When a page asks for a sign-in, Civi tells the team to take control and sign in themselves. Each organization gets a saved Browserbase profile (`private.organizer_browser_contexts`, created on first use) so sign-ins carry across conversations; if the plan doesn't allow profiles, browsers open without one. If the page wanders somewhere disallowed, the browser goes back. Page text reaches the model labeled as untrusted data.
- **Approved actions (`browser_act`).** To post, comment, reply, like, react, share, join, follow, RSVP or message, Civi calls `browser_act` with a plain description, the element to press or the text box plus exact text, and the button that sends it. The page is checked first (sign-in forms and buttons, payments and deleting are refused outright), then an approval card appears in the chat with the description, the site and the exact text. Approve runs it once, at a human pace (typed in short pieces, unhurried pauses), after re-checking the page still shows the same elements; Decline or no answer within 4 minutes means nothing is done. Requests are keyed by the model's tool call (`private.organizer_browser_actions`, RPCs `request/decide/mark_browser_action`, `browser_action_status`, `pending_browser_actions`), so a reconnect resumes the same request and an action never runs twice; an action interrupted mid-run is reported as "may already have run" instead of being retried. Pending approvals also come back with saved work after a reload.
- Scrolling happens in smooth steps with pauses, so reading is unhurried.
- The live view sits above the chat, watch-only while Civi works. **Take control** makes it interactive and pauses every browser tool ("the team has taken control"); **Hand back to Civi** resumes; **Close** releases the browser.
- Conversations are stamped with a fingerprint of Civi's instructions and tools (`organizerVersion`, in the OpenAI session metadata). OpenAI keeps a conversation's original instructions for its whole life, so when the fingerprint changes after an update, the next message continues in a fresh conversation automatically.
- When a browser tool fails, the real reason (customer-safe) is shown in the chat and given to Civi to report, instead of a generic failure. Browserbase setup falls back from the full settings to leaner ones and finally the bare request; if the live-view link can't be fetched, Civi still browses and the window stays hidden.
- Not live-verified yet: needs `BROWSERBASE_API_KEY` in the server secrets.

## Configuration

Apply `202610310005_agent_work_runner.sql`, `202611090001_managed_organizer.sql` and `202611090002_openai_helper_threads.sql`.

Server secrets:

- `OPENAI_ORGANIZER_ENABLED=true`
- `OPENAI_API_KEY`, with Agents read/write and Responses write permissions
- `OPENAI_ORGANIZER_MODEL=gpt-6-sol`; reasoning is explicitly `medium` as requested
- `OPENAI_ORGANIZER_TIMEOUT_MS` (15,000–180,000; default 120,000)
- `OPENAI_ORGANIZER_SESSION_CENTS` (1–10,000; default 200), used only when `OPENAI_ORGANIZER_PROVIDER_SPEND_CAP=true` on a provider project verified to support that field
- `OPENAI_ORGANIZER_SESSION_TOKEN_LIMIT` (default 100,000, checked before new turns)
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
