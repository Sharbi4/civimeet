# Platform stewards, events and payments

This implements the founder's Community Steward brief and the supplied investment assessment as product requirements, with current integration boundaries checked against official provider documentation on October 30, 2026. Agent playbooks live in `src/lib/platform-playbooks.json`; executable worker instructions are built by `buildPlatformInstructions`. Migration 006 creates platform-specific defaults for new organizations and updates only untouched generic defaults. Customized instructions are preserved. Platform-specific memory/queue isolation remains unchanged.

## Platform roles

| Channel | Helpful contribution | Gathering work |
| --- | --- | --- |
| X.com | Concise sourced replies, useful updates, public partner leads | Approved announcements and logistics updates |
| Eventbrite | Clear event descriptions, attendee FAQs, operational insight | Listings, capacity, schedule, registration summaries, post-event lessons |
| Facebook | Resource answers and recurring needs on authorized Page surfaces | Invitations and updates grounded in prior contributions |
| Reddit | Specific evidence-based help that respects community rules | A gathering suggestion only when relevant and permitted |
| Nextdoor | Local resources and public vendor/service-area knowledge | Practical neighborhood gathering information |
| Instagram | Useful visual explainers, accessible captions, genuine community stories | Announcements, reminders and consent-based recaps |
| Public web | Search-grounded resources, vendors, venues and constraints | Sourced venue/vendor comparisons |

The Community Steward coordinates these workflows. Each worker receives its own organization's instructions, knowledge and credential. It recalls its own memory, identifies a helpful task, researches facts, drafts the exact proposed action, requests approval, executes only through a connected authorized tool, verifies the tool result, and records outcome and next follow-up. This lifecycle is the execution contract; hosted workers and platform connections are still pending. Stored instructions alone do not perform actions.

## Product vs backend

Show organizations: useful findings, unresolved needs, plans, follow-ups, vendors, event dates, budgets, quote comparisons, approvals and actual outcomes. Keep credentials, raw instructions, queues and leases under administrator settings or in backend operations. Never show a simulated live agent feed. Connection selection, verified authorization, and active execution are different states.

## Event planning now

`/events` stores purpose, related steward plan, proposed date/venue, budget, vendor quote references, cost approvals and event outcomes. Only organization editors can draft. Owners/admins approve the current event revision and individual vendor costs. Costs use integer USD cents; concurrent approvals serialize on the event and cannot exceed its budget. Editing an event resets approval and rejects its outstanding cost proposals, requiring fresh review. Closing or cancelling is recorded. A cost approval never claims money moved; venue notes never claim a booking.

## Funding model confirmed by the founder

**CiviMeet collects organization funds and then pays vendors.** Use Stripe Connect separate charges and transfers, with verified connected vendor accounts. Plaid links bank accounts; it does not replace the payment processor. No actual fund collection, transfer or payout is enabled by this release.

Planned execution:

1. Organization admin approves a fixed funding amount/currency/event and completes provider-hosted payment authorization. Use Stripe Checkout or PaymentIntents for collection on the CiviMeet platform account.
2. For bank funding, the organization links its own account through Plaid Link. Exchange public tokens and produce the Stripe-compatible bank token server-side. Keep Plaid access tokens encrypted; never store raw bank credentials or routing/account numbers in CiviMeet. The Plaid/Stripe PaymentIntents path requires provider enablement, not just API keys.
3. Verify signed provider webhooks with replay protection. Record immutable provider IDs, amounts, currency and owning organization/event. A redirect or `processing` state is not a successful payment. Model pending, confirmed, failed, refunded and disputed funds explicitly.
4. Reserve approved vendor amounts against confirmed event funds. Verify the intended connected account belongs to that vendor and is payout-ready. Submit idempotent transfers only for the exact approval; no model-supplied arbitrary account IDs or amounts. Keep transfer and bank payout statuses distinct.
5. Reconcile transfers, fees, refunds, reversals and disputes. Prevent duplicate execution after retries. Changes to recipient, amount, currency or event invalidate approval. No invented fees, percentages, escrow guarantees or instant-ACH claims.

Before enabling money movement: configure Stripe Connect and webhook secrets, complete vendor onboarding, obtain Plaid production access and Stripe integration enablement, implement reconciliation/refund handling, and pass sandbox tests for delayed/failed funding, duplicate webhooks, tenant boundaries, over-budget approvals, and transfer retries. API keys belong in hosting secrets, never chat or client bundles.

## Primary references

- [Perplexity Agent API](https://docs.perplexity.ai/docs/agent-api/quickstart)
- [Eventbrite app authentication](https://www.eventbrite.com/platform/docs/app-oauth-flow)
- [X create/edit posts](https://docs.x.com/x-api/posts/create-post)
- [Nextdoor API access applications](https://developer.nextdoor.com/v1.0/reference/applying-for-access)
- [Reddit Data API terms](https://redditinc.com/policies/data-api-terms)
- [Meta-maintained Instagram API documentation](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Stripe ACH lifecycle](https://docs.stripe.com/payments/ach-direct-debit)
- [Plaid Auth and Stripe](https://plaid.com/docs/auth/partnerships/stripe/)

Provider capabilities must be rechecked at connector implementation. In particular, approved commercial Reddit access and Nextdoor partnership access cannot be inferred from an organization's platform selection. This plan does not depend on Facebook Group/personal-profile automation.
