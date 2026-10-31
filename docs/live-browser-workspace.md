# Community Steward browser workspace

## Provider decision

Use **Steel Cloud + Chromium**, as selected by the founder. This supersedes the earlier Browserbase proposal. Perplexity remains the sourced research tool. Neither research output nor website text can grant browser, publishing, messaging, booking, or financial authority.

The browser belongs in the product's global workspace, alongside Contribute → Connect → Convene → Follow through. It is not an administrative debug screen. Existing planning, vendor and payment approvals retain their boundaries.

## Implemented first slice

- A root-level dock survives navigation between authenticated workspace pages. It offers collapsed, side-panel, split-screen and full-window layouts; switching organizations clears the displayed session.
- Organization administrators approve individual public website origins. Social-platform browser automation remains disabled, even when an organization selected that channel or adds its origin.
- Server-authenticated commands create actual five-minute Steel Chromium sessions, navigate to an exact approved URL, scroll, inspect a real capture, and stop/disconnect. No synthetic browser images or invented action results are used.
- Each organization/platform agent has a separate logical workspace and private provider/profile mapping. Public metadata contains task, origin, status, expiry and safe action outcomes. Raw debug URLs, cookies, CDP endpoints, page content and credentials are not persisted in those tables.
- Browser operations use database leases, request IDs, membership revalidation, explicit completion and conservative recovery. Interrupted operations require a stop before reuse; no automatic action replay. Creation and handoff attempts are limited to 30 per organization per rolling 24 hours.
- Steel session creation explicitly requests `recordings: false`, disables automatic CAPTCHA solving, and uses server-side read-only viewer configuration for agent sessions.
- Agent observation returns an initial actual capture and refreshes every five seconds while the panel is visible and the session is ready. This is a sequence of snapshots, not a continuous stream or an autonomous task executor. Input/iframe/authentication/payment pages are conservatively hidden and marked for human review. No screenshots are stored by CiviMeet.
- The Community action agent dock shows state-specific controls: help requests offer takeover only when enabled, human control offers return, paused tasks offer resume, and active or failed sessions offer stop. A permitted example.com demo preset is available to organizations that already approved that origin. Failed requests reload the persisted state so stop/recovery is available.
- The handoff adapter stops and verifies release of the old provider session before creating the next mode from its private profile. This revokes old viewer capabilities. The logical task and approved checkpoint URL persist; the exact DOM/tab history does not. No action is automatically replayed after return.

## Deployment configuration

Server only: `STEEL_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. No Browserbase credentials or Python runtime are required. Apply migration `202610300008_browser_workspaces.sql`.

Keep `STEEL_HUMAN_HANDOFF_ENABLED=false` until live tests prove provider-side recording/log behavior and revocation. This switch does not establish those properties itself. Never instruct customers to enter passwords or OTPs before this gate passes. Do not put secrets in `VITE_` variables, Git, chat, logs, or ordinary database fields.

The founder reported saving the Steel server key on October 30, 2026 (Phoenix). A readiness response only confirms presence of configuration, not provider connectivity or successful browser execution.

## Remaining acceptance work — not represented as shipped

1. Public-page live acceptance passed on October 31, 2026: the isolated demo owner opened example.com through the deployed authenticated API, received a real screenshot, scrolled, refreshed the capture, and disconnected; all returned HTTP 200. This proves the deployed CDP path for this public-page case, not credential handoff or social-platform execution. Fixes used manual redirect handling in the hosted runtime and stopped validating unused interactive viewer URLs for read-only sessions.
2. Verify that `recordings: false` also prevents sensitive input from being retained in all applicable provider logs/traces, not only video. Use controlled test credentials/OTP, never customer credentials. Resolve any provider retention gap before enabling human handoff.
3. Verify stale viewer URLs cannot control the successor session; test two administrators, multiple tabs, session expiry, membership removal, network failures and profile-save readiness. Add immediate cancellation/fencing for in-flight actions; current stop waits for the bounded operation lease.
4. Add a short-lived authenticated streaming relay. Steel debug URLs are unauthenticated bearer capabilities; an iframe's pointer-event setting is not an authorization boundary. Current interactive URLs, when enabled, are restricted to the controlling administrator and capped by the provider session lifetime.
5. Complete safe profile deletion/revocation. Disconnect currently releases the session and unlinks the local profile; provider-retained profiles require operator removal. Do not call this data erasure or remote-site logout.
6. Add the long-running orchestrator, task/plan linkage, checkpointed tool calls and hosted scheduling. Current browser actions are supervised explicit administrator requests, not autonomous AI planning. Add click/type/approved-form tools only with exact action approvals, sensitive-input exclusion, navigation controls and verified outcomes. They are deliberately unavailable in this slice.
7. Add supported social-platform connectors individually after access and automation permissions are verified. Account login alone grants no new publishing, messaging, booking or payment rights.
8. Extend from one connection per organization/platform agent to multiple authorized accounts, browser notifications and finer-grained viewer permissions.

## Verification

Automated tests cover request authorization, origin restrictions, recording/CAPTCHA configuration, sanitized failures, no screenshots during authentication/human control, failed release preventing handback, and global-dock navigation/organization switching. SQL rollback fixtures cover tenant isolation, client write denial, viewer denial, disabled social channels, duplicate requests, exclusive leases and stale completion rejection. These tests do not replace live provider acceptance.

## Primary references

- [Steel session configuration](https://docs.steel.dev/overview/sessions-api/configuration)
- [Steel live viewers](https://docs.steel.dev/overview/sessions-api/embed-sessions/live-sessions)
- [Steel human-in-the-loop controls](https://docs.steel.dev/overview/sessions-api/human-in-the-loop)
- [Steel recording-off release](https://docs.steel.dev/changelog/changelog-038)
- [Steel persistent profiles](https://steel.dev/blog/profiles)
- [Steel authentication and CDP](https://docs.steel.dev/overview/authentication)
- [Cloudflare outbound WebSockets](https://developers.cloudflare.com/workers/examples/websockets/)
