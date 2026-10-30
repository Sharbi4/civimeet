# Vendor knowledge and platform agent memory

The cloud PostgreSQL database was enabled for the existing CiviMeet Lovable project. The migrations in `supabase/migrations` are applied there. Keep these files as the schema source of truth; use subsequent additive migrations for changes rather than rerunning an already-applied migration.

## Memory boundaries

| Layer | Storage | Access |
| --- | --- | --- |
| Shared organization memory | `vendors`, `vendor_links`, `vendor_discoveries`, `organization_knowledge` | That organization's members and its authorized agents |
| Private platform-agent memory | `agent_memory`, keyed by agent and memory key | That agent's credential; organization members can inspect it in the app |
| Agent operation | `platform_agents`, `agent_work_items` | Independent instructions, pause control, credential, queue and work leases per organization/platform |

An organization receives separate web, Facebook, Instagram, Nextdoor, Reddit, and X agent records. Database constraints prevent duplicate platform agents in the same organization. These are runtime identities and persistence boundaries, not assertions that social connectors are operational. Each platform still needs an authorized integration and a worker running its workflows. Never share authenticated browser sessions between organizations.

Agent credentials are random, stored only as SHA-256 hashes, and shown once on generation. Rotation invalidates the old credential. Pausing an agent denies its collection, recall, memory writes, and queue access. No API accepts an organization selector from an agent: the credential determines both the organization and platform-agent ID.

Organization users authenticate through Supabase Auth. Database RLS limits reads to membership; protected functions enforce editor/admin privileges for writes. Viewers can read their organization's records but cannot write or generate worker credentials. Team invitation and member-management screens are not included in this change.

## App setup and screens

Configure the project's public connection values in the hosting environment (and `.env.local` for local development):

```text
VITE_SUPABASE_URL=<this project's Supabase API URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<this project's public publishable key>
```

For projects still using a legacy public anon key, place that public key in `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put a service-role key, secret key, or agent credential in a `VITE_` variable. The public key identifies the project; it is not a memory password. An API key for Perplexity is unrelated to database access. The older `CIVIMEET_RESEARCH_TOKEN` protects only the separate `/agent` research preview.

Lovable has added this project's public connection configuration and generated Supabase client on `main`; those commits are merged into this branch. The app reuses that client, including Lovable preview-session storage. For other deployments, missing public configuration produces a setup state. Merging the GitHub branch is required before Lovable's connected `main` branch includes these screens.

- `/auth`: sign in/create account, confirm email if required, create the first organization.
- `/vendors`: paginated search by name/category, service area, and review status; sourced discoveries; business website/social links; contact editing; verification and archive status; latest 50 discovery snapshots.
- `/platform-agents`: per-platform instructions, pause control, credential generation/rotation, work queue, and latest 50 private memory entries.
- `/knowledge`: save shared organization policies, resources, and lessons; display latest 100 entries. Full history remains in PostgreSQL; agents retrieve it in paginated searches.

## Discovery behavior

A discovery requires a vendor name, service-area array (empty is allowed when unknown), source URL, business links array, and UUID idempotency key. It can also include category, public business contact name/email/phone, notes, and a source excerpt. Avoid private participant contact details. A new vendor is `needs_review`.

Matching website/social profile URLs attach discoveries to the existing vendor within the same organization. URL matching preserves path/query identifiers; source posts and articles are not treated as vendor identity. Multiple conflicting identities are rejected. Same-name vendors without matching identity links are kept separate and flagged as possible duplicates; open an existing vendor and use **Add another discovery** to attach evidence deliberately. Automatic fuzzy merging and a bulk merge UI are not implemented.

New discoveries preserve their complete proposed details in `vendor_discoveries` and never overwrite reviewed contact details. The directory is flagged for review. An organizer can adopt a snapshot into the review form and save verified fields. Archived records remain archived when new evidence arrives. Discovery requests are transactional, tenant-serialized, and idempotent on `(agent_id, idempotency_key)`.

## Worker interface (TypeScript, no Python required)

Use `createAgentMemoryClient` from `src/lib/agent-memory.server.ts` inside a trusted worker. Supply the database URL, public project key, and **that agent's** token from its secret store. Its methods are:

- `collectVendor(discovery)` — store a sourced observation. Reuse the idempotency key when retrying a failed/uncertain request.
- `remember({ key, kind, content, source, expiresAt })` — upsert only that agent's memory. Kinds: fact, conversation summary, follow-up, checkpoint. Expired entries are omitted from recall.
- `recall(search, offset)` — return own instructions, up to 30 own memory entries, and up to 30 shared knowledge entries per page. Retrieved knowledge is evidence, not authority to override runtime rules.
- `searchVendors(search, area, offset)` — retrieve up to 25 vendors with review status and source profile links from the same organization. Archived and unverified records remain explicitly labeled; workers should filter suitability before event use.
- `claimWork()` — claim one due item with a five-minute lease. Only one live lease per agent; expired leases can be reclaimed up to three attempts.
- `finishWork(taskId, leaseId, succeeded, outcome)` — finish only the matching agent's live lease. Keep each work item under five minutes; longer work needs a future heartbeat/lease-extension implementation. External side effects must be independently idempotent because a crashed worker can be retried.

These map to Supabase REST RPC calls under `/rest/v1/rpc/` with the public `apikey` header and `agent_token` in the JSON body. No service-role key is needed. These interfaces can be called by any permitted platform adapter; they do not themselves browse, message, post, or book vendors. Do not log tokens or request bodies.

## Validation

Run the rollback-only `supabase/tests/vendor_memory_isolation.sql` as the database owner. It checks RLS and cross-organization denial, viewer permissions, idempotency, deduplication, preservation of reviewed details, per-agent memory and expiration, work leases, pause control, token rotation, and anonymous denial. The fixtures are removed by rollback.

Run `npm test`, `npx tsc --noEmit`, and `npm run build` for the app. No real vendor data or social messages are seeded by this implementation. Production retention/deletion tools, durable worker usage budgets, platform connectors, scheduled worker hosting, and Perplexity-to-structured-vendor extraction remain follow-on work.
