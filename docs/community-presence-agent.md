# Community presence agent

The Organizer Chat action **Build our community presence** runs the `community_presence` skill through the authenticated Perplexity research endpoint. The same skill is available in platform conversations and selected automatically for community-growth, relevant-group, and helpful-comment requests.

Before a provider call, the server requires an organization brief with mission and service area. Existing authorization, organization-scoped memory, run reservation, request idempotency and quotas apply. Onboarding now explicitly asks for neighborhoods/service area, audience, mission, community maturity and helpful channel responsibilities. These use the existing brief fields and do not require a database migration.

The skill prepares a sourced list of public community candidates, helpful content drafts, a gathering idea and a bounded weekly plan. It must distinguish evidence from inference and require the source conversation for a contextual comment. It does not gather private member data, infer personal sensitive traits, send unsolicited bulk messages or impersonate residents. Organization representation and AI assistance must be transparent.

Results persist in research history and shared organization knowledge using the existing completion path. Users can open the existing draft review flow to choose an exact draft and destination. Approval records do not execute external actions.

## Still to implement

- Supported account authorization and per-site browser execution for social channels.
- A durable action queue with exact-payload approval verification, idempotent execution, stop/recovery and external receipts.
- Authorized page creation and contextual comments/messages where supported. Facebook Group joining/creation/posting are not enabled; group work remains research and drafts for human handling.
- Recurring background jobs, calendar invites, RSVP synchronization and budget enforcement/payment execution.

The new skill is research and preparation, not an unattended social-media operator. The website now explains the larger product vision and labels connected execution as in development.
