# Community dashboard and grounded research

Open `/dashboard` after signing in. Organization members see actual scoped counts, community needs, steward plans, follow-up dates, research history, and activity. Editors record needs and draft plans. Owners/admins approve a specific revision and record outcomes. Editing invalidates approval; completed plans are immutable. Planning approval never authorizes outbound messages, bookings, or payment.

The first loop is team-initiated: record a need → draft a useful contribution → research → review → follow through → record the outcome. Draft plans use a transparent structure, not fabricated AI generation. The organization selector persists in this browser session and is rechecked against membership on navigation.

## Perplexity in the dashboard

Set these in server hosting secrets:

- `PERPLEXITY_API_KEY`: existing Perplexity key.
- `SUPABASE_URL`: this project's API URL.
- `SUPABASE_SERVICE_ROLE_KEY`: this project's server-only database credential, provided by the hosting/database integration. Never put it in a `VITE_` variable or paste it into chat.

`CIVIMEET_RESEARCH_TOKEN` remains only for the older operator preview at `/agent`. The dashboard uses the signed-in user's session and verifies organization editor membership on the server.

GET `/api/steward/research` reports configuration presence only. POST verifies the user's identity, reserves a durable run, calls Perplexity, and stores the result, sources, provider model, timestamp and reported usage. A copy with source references is saved into organization knowledge. Selected plan context is included; excerpts of the latest three shared knowledge entries are optional. No private platform-agent memories or member rosters are included.

Each organization has one active request and ten attempts per rolling 24 hours. The database enforces these limits across server instances. A request ID prevents duplicate provider calls when retrying a network failure. Failed attempts count toward the cap; a separate explicit new attempt uses a new ID. Runs interrupted for over three minutes are marked failed when a new request is reserved. There are no automatic paid retries. Provider success and persistence success are both required before reporting completion.

Configuration present is not a live provider test. Live verification requires an authenticated organization editor making one funded request in the deployed dashboard and seeing the saved answer and citations. The preview may require a Lovable-authenticated browser, so an unauthenticated HTTP 401 from that host does not establish a Perplexity failure.

## Scope and next steps

This implements the first two phases of `community-steward-plan.md` as a human-initiated planning workflow. Hosted continuous stewardship, automated signal ingestion, AI plan generation, provider account authorization, communications approval/execution, and event logistics are not running. Platform selections remain clearly distinguished from connections.
