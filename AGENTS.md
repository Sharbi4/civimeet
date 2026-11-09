<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Rules

- Organizer voice uses a dedicated authenticated raw HTTP endpoint and request-time ElevenLabs agent isolation checks; it never exposes organization memory, approval actions or outbound tools to hosted agents. Why: conversation credentials grant provider access, not application authorization.

- App-email templates use the managed server-only sender, fixed owner recipients, and no local email queues; /lovable/ handlers authenticate themselves and bypass application redirects. Why: delivery and suppression belong to the managed email service.

- Contact and Get Started share a validated public demo-request server action with private, idempotent database inserts; ordinary workspace members cannot read website leads. Why: public acquisition leads belong to the site owner, not customer organizations.

- Analytics report analysis is editor-only and uses a user-scoped membership check, bounded CSV/JSON parsing, and a cancellable AI Gateway Responses stream; uploads/results remain transient unless users download results, avoiding unnecessary retention of analytics data.
- AI Gateway Responses helpers live in `src/lib/ai` with request-local gateway-issued run IDs and no automatic retries; analytics uses the shared helpers without changing the existing research provider.

- Google Analytics is initialized once in the root head using a validated public measurement ID from a server function; root navigation tracking sends pathname-only page views with automatic page views disabled to avoid duplicates and sensitive URL parameters.

- Web fonts are self-hosted as Lovable asset pointers (`.asset.json`) and declared with `@font-face` in `src/styles.css`; never add Google Fonts `<link>` tags or `@import` a remote font URL. Why: remote `@import` breaks the Lightning CSS build, and CDN-hosted pointers keep the repo lightweight while staying available on every deployment.

- Connectors keep status in `public.organization_connectors` (member-readable, realtime) and everything sensitive in `private` tables reachable only through service-role RPCs; saved logins and OAuth tokens are AES-256-GCM sealed and bound to organization + connector, never returned to clients, and disconnect deletes the secret and discards the agent's Steel profile (Steel's API currently has no profile delete route, so the reference is dropped and deletion is attempted best-effort). Why: an agent signed into a customer's accounts is the most sensitive thing CiviMeet holds.

- Agent plans live in `agent_plans`/`agent_tasks`; only the service role creates, claims (leased, dependency-gated) and finishes tasks, and the database sets each task's level from its kind. The runner reports only verified outcomes: drafts are "ready for review, not published", researched vendors are "not contacted", venues "not booked", and platform actions wait for connection and approval and never claim to publish without an executor. Why: research and drafts are not completed external actions; the dashboard must never overstate what happened.

- Organizer Chat routes tool instructions (open/connect a platform, browser, agent controls, approvals) through `src/lib/chat-intents.ts` and `ChatActions.tsx` to the existing authorized APIs before anything reaches Perplexity; each action and its real outcome is recorded in `organizer_chat_actions`. Success is reported only after the backend confirms it (for example `browser_finish` returning connected). Why: Civi must use its tools instead of talking about them, and must never claim a tool ran when it didn't.

- The agent browser lives at the top of the chat screen (`ChatBrowser.tsx`), above the conversation; the side panel keeps approvals, activity and memory, so only one live viewer is ever on screen. Steel viewer addresses are framed only in the exact shape `api.steel.dev/v1/sessions/{id}/player[/{access segment}]` for that same session, and a browser that opened but can't be handed to the person is released immediately. Why: people need to see where the agent is working, and an unseen live browser in a customer's account must never be left running.

- Computer use: Muse (Meta Responses API, `computer` tool) decides, Steel runs the browser, and `browser-agent-policy.ts` checks every proposed action against the live page before it runs; mode is read-only, sign-in/verification pages go to a person, Meta safety checks are never auto-acknowledged, social sites are browsed only through their own connection, and screenshots are never stored. Why: the model's intent and web pages are untrusted; only the harness decides what actually happens in a customer's account.
