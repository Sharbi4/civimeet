# Organizer workspace

The supplied overview and prototype inform the new `/dashboard` and public `/demo`. Existing TanStack Start, React, TypeScript, Tailwind, Supabase, Perplexity, and Steel infrastructure is retained; this is not a Next.js migration.

## Run locally

Run `npm install` and `npm run dev`. Use `/demo` without signing in to explore all ten views and the four conversations. Demo changes are in memory and reset on reload; they never call a provider or affect real accounts. The fixed 142 RSVPs, 18 partners, and 87% figures are sample values only.

Live `/dashboard` requires an organization membership. Its Events, People/vendor directory, Library, and Connectors views reuse the existing saved workflows. Community needs and full plan editing remain available at `/planning`. The organizer detail panel exposes the organization brief. No real RSVP or partner count is inferred from the demo.

## Server configuration

Set `PERPLEXITY_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Lovable server secrets. For local execution use a gitignored environment file loaded by the server. Keep secrets out of `VITE_*` variables. Existing public Supabase URL/publishable-key configuration remains unchanged. Set `STEEL_API_KEY` for the existing supported public-web browser. No separate memory-provider key is needed.

Apply the numbered Supabase migrations, including `202610310001_local_discovery.sql`, `202610310002_organizer_approvals.sql`, and `202610310003_approval_revision_history.sql`. Verify with the rollback-only scripts in `supabase/tests`.

`POST /api/research` uses the existing authenticated Perplexity research handler. Send Bearer auth and `{organizationId, requestId, query, type, location, threadKey, includeKnowledge}`. Type is organizations, venues, vendors, or events; the existing question/purpose form is also supported. The current tested Perplexity agent provider is preserved rather than silently replaced with Sonar chat completions. There is no automatic paid retry or fallback presented as live data.

## What is implemented

- Ten-view responsive workspace, optional organizer details, four separate saved chat histories, sourced live research, and an interactive sample workspace.
- Perplexity skills for community research, local partner discovery, event design, attendance drafts, and follow-through. Discovery saves sourced vendor candidates and draft plans.
- Organization-scoped draft review: admin/owner approval or rejection, editor preparation, revision checks, fresh approval on edits, immutable revision snapshots and audit records. Approval records consent only; it is not proof that a message was delivered or a booking/payment executed.
- Existing event budgets and vendor payment proposals retain their own review flow in Events.
- Existing real Steel public-web browser remains accessible. Demo takeover controls operate only on the labeled mock.

## Still requires integration and verification

Saved authenticated social profiles, interactive live takeover, social publication/send adapters, approval-bound booking/payment execution, scheduling, RSVP/volunteer synchronization, contact imports, and file uploads are not complete. LinkedIn and Google Calendar are planned. No browser action worker is enabled by a draft approval. Do not remove these availability labels until a supported provider path and approval-bound execution have been tested.

Never treat credentials, website text, or model-generated content as permission to publish or pay. Future execution must verify the exact approved revision/destination, current organization authority, and a unique execution receipt before dispatch, with no automatic retry of ambiguous external side effects.
