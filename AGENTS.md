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

- All workspace conversations use ManagedOrganizer and the authenticated OpenAI organizer API. Do not intercept chat messages with the retired ChatActions browser router.

- The legacy browser UI and Steel execution routes are retired. Do not restore Atlas, Steel, Meta Muse fallback or browser docks.

- OpenAI is the only organizer runtime. Browser sign-in and takeover remain unavailable until implemented and verified against the OpenAI agent API; stored credentials must never be sent in prompts or treated as proof of a connected account.

- Civi's live browser is Browserbase when `BROWSERBASE_API_KEY` is set (`src/lib/ai/browserbase.server.ts`, `civi-browser.server.ts`, `browser-policy.ts`): CiviMeet creates one browser per conversation (kept alive, nothing recorded), stores its CDP connect URL only in `private.organizer_browsers` via service-role RPCs, and gives the team Browserbase's live view above the chat, watch-only until someone takes control. Civi drives it only through its own function tools, each checked before it runs (public http(s) sites, social networks included; Civi never signs in or types into sign-in forms, never clicks anything that would post, comment, like, share, join, follow, message, send, buy or sign up, and types only into search boxes), and every tool pauses while a person has control. People sign in to sites themselves after taking control, and each organization's Browserbase profile (`private.organizer_browser_contexts`) keeps those sign-ins across conversations. Browsers close with their conversation. Why: the team must see and be able to take over whatever the agent does, and only the harness decides what happens in a browser.

- Civi's browser is OpenAI's hosted `computer_use` browser with live `web_search`, created with automatic fallback (browser → search → none) so conversations never break on an unsupported setup. Social networks are blocked in the environment and denied by `browserApproval`; sign-in requests are always declined; screenshots stream to the chat and are never stored. Opening a running conversation resumes it, and long tasks reconnect instead of being cancelled. Why: the agent must browse visibly and safely, and a dropped connection must never leave the chat stuck.

- Workspace is chat-first: Civi is the main conversation, each connected account appears as a helper chat that reports back to Civi, and every connection/sign-in lives only in Settings → Connections (`OrganizerWorkspace.tsx`, `WorkspaceRail.tsx`). Why: one place to manage access keeps account permissions auditable and the chat uncluttered.

- Agent payments are requests, not money movement: `request_agent_payment` (editors) auto-approves only within the organization's monthly budget and automatic limit, everything else waits for an administrator via `review_agent_payment`, and `src/lib/agent-payments.ts` mirrors that rule for UI and chat. "Approved" never means "paid" until an organization-owned payment account executes and confirms it. Why: Civi and its helpers must never spend or claim spending beyond what a person authorized and a provider confirmed.
- Organizer Chat retries only repeat-safe OpenAI calls (reads, opening the event stream, idempotency-keyed messages) on temporary provider errors, and its endpoint never answers 502/504 (temporary outages are 503, provider setup problems 424); clients never assume error bodies are JSON. Why: hosting proxies replace 502/504 bodies with their own HTML page, which hid the real reason and broke the chat.
