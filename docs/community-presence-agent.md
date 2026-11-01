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

## Event geography

An event now captures a separate `geographic_area` (for example Orlando, Florida). This is independent of the organization's home area and any connected account's address. Existing events keep an empty area until a person supplies one; no location is inferred from a venue name.

The Events view offers vendor discovery and community presence research using that event. API requests carry the event ID; after membership validation, the server retrieves the event within the same organization, checks its active status and saved area, and overrides any caller-supplied location before reserving the run. Event-specific chat history is filtered by event ID. Shared organizational memory remains available, with instructions to use the event's geography over the home area and to check vendor service-area evidence.

Vendor candidates continue through the existing atomic discovery flow: sourced public business details and profile links, review status, deduplication and organization-scoped storage. Research run inputs retain the event ID and area. Existing vendor service areas are included in context; a vendor is not automatically considered local just because the event is there. Research is a saved snapshot, not a live statement of availability or willingness to participate.

This does not automatically join every local group, change a Nextdoor address, collect private resident data or publish comments. Location identifies where to research; mission, group rules, account eligibility and human approval still determine whether an eventual action is appropriate. Event edits revise the event and invalidate existing vendor-cost approvals.
