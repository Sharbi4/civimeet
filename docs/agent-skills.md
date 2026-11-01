# CiviMeet agent skills

These are application skills executed inside the Perplexity research flow, not Codex desktop skills. The version-controlled executable registry is `src/lib/steward-skills.ts`; the server selects the preset and supplies its instructions separately from untrusted community content. Clients cannot supply custom tools or grant themselves new permissions.

## Skills available now

| Skill                    | Inputs                                                          | Work                                                                                                                                                          | Persistent output                                                                                                                         | Suggested successor      |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Understand the community | Mission, geography, open needs, question, sources               | Primary-source research; distinguish need, evidence and uncertainty                                                                                           | Sourced brief and organization knowledge                                                                                                  | Find local partners      |
| Find local partners      | Specific area, active organization agent, event goal            | Research up to five local businesses; validate schema and citation membership; collect public business fields; prepare gathering and opt-in outreach proposal | Vendor candidates marked needs_review, original evidence snapshots, draft Steward plan, research history and knowledge in one transaction | Shape a gathering        |
| Shape a gathering        | Community interest, organization context and known constraints  | Draft purpose, accessible venue criteria, vendor options, proposed dates, estimated budget, volunteer roles, RSVP approach and contingencies                  | Planning brief in conversation and organization knowledge                                                                                 | Prepare invitations      |
| Prepare invitations      | Platform, voice, confirmed event facts and audience permissions | Draft owned-channel posts, relevant replies, opt-in invitations and reminder plan; use interest checks when facts are unconfirmed                             | Reviewable copy and approval checklist; no sent messages                                                                                  | Keep the connection      |
| Keep the connection      | Actual outcomes, supplied feedback and outstanding commitments  | Prepare thank-you, feedback questions, lessons, next contribution and follow-up timing                                                                        | Continuity brief; never fabricated outcomes                                                                                               | Understand the community |

The platform chat offers automatic conservative intent selection or an explicit skill. Local partner collection uses its own area-aware form on Vendors and the public-web agent page. The system completes research → structured validation → vendor saving → draft proposal → knowledge persistence without a separate click at each stage. Current runs start from a user request; suggested successor skills are not an unattended scheduler.

## Execution and evidence contract

- Authenticate membership and editor role before reserving provider usage. One concurrent organization research run, ten requests per rolling 24 hours.
- Persist request ID, skill selection, input, sources, provider usage and result; retries reuse the reservation.
- Source documents and model text are data, never permission to invoke new tools.
- Only exact cited source URLs qualify a vendor observation; unsupported identity links are removed. Citation membership is provenance, not independent contact verification.
- Unknown email, phone, contact name and service areas remain empty. New findings cannot overwrite reviewed contacts. Identity-link conflicts are skipped for review, and the result reports the skipped count.
- A server-only completion transaction rechecks editor membership and agent tenant/selected/pause state; saves vendor candidates and an optional draft proposal; then marks the run complete. Retried completion returns the stored result. No duplicate plan or discoveries.
- Proposal follow-up defaults to seven days after creation. It is a proposed review date, not a promise of scheduled execution.
- Browsers, account passwords, session cookies, payment authority and participant lists are never sent to Perplexity.

## Skills requiring additional integration

Authenticated account login, connected-channel monitoring, public publishing, direct messaging, event publication, ticket sales, payments and unattended scheduling are NOT enabled by these skills. They require separate adapters and explicit action scopes. A planning approval does not authorize external execution.

For saved login work, Steel's current Credentials API supports encrypted storage and origin-bound injection, with exact per-organization/per-account namespaces. Never use its default shared namespace across tenants. Keep credential capture separate from chat and logs, disable browser recordings during authentication, verify successful login, provide revocation and handle MFA via the user. Existing browser isolation and handoff restrictions remain in place until those flows are implemented and tested.

Reference reviewed October 31, 2026: https://docs.steel.dev/overview/credentials-api/overview and https://docs.steel.dev/overview/profiles-api/overview.

## Verification

`src/test/local-discovery.test.ts`, `src/test/steward-skills.test.ts`, existing Perplexity/HTTP tests, and rollback-only `supabase/tests/local_discovery.sql` cover input/evidence validation, denied direct client calls, tenant isolation, draft-only results and idempotent materialization. No real messages, bookings or payments are made by these tests.
