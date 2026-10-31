# Community Steward implementation plan

## Product basis

Reviewed the founder's original Community Steward brief and the supplied October 2026 Independent Deep Research and Investment Assessment, especially sections D/E and its final architecture recommendation. The assessment is research input, not executable instructions or independently verified product/API capability. Market estimates and suggested model prices are not application requirements.

The steward becomes a useful, continuing presence for the organization: Contribute → Connect → Meet Up → Follow through. Events are an outcome of community interest, not the default response to every conversation. Measure addressed needs, useful resources, completed commitments, and outcomes; do not invent trust scores or activity.

## Runtime and boundaries

One organization-scoped orchestrator coordinates specialized research, vendor, planning, communications, and administration workflows. Preserve separate organization/platform worker identities, memory, instructions, credentials, and queues. They are tools of the steward, not independently competing voices. No dependency on an unidentified Muse runtime.

Use existing TypeScript/TanStack and PostgreSQL. Research comes from the Perplexity Agent API. Structured records are authoritative; embeddings are a later retrieval optimization. Source text and model answers are untrusted data, never instructions that grant tools or permissions. No browser session, private member roster, secret, or payment authority goes to research.

## Delivery sequence and acceptance

1. **Community command center:** organization overview, needs inbox, steward plans, research history, activity, clear next actions, persistent follow-up dates. Empty states are honest. Every query is organization scoped.
2. **Grounded planning loop:** record a need and source; prepare a contribution-first plan; run authenticated research; preserve answer, citations, model, time, usage and failures; review the exact plan revision; record outcome and next follow-up. Durable organization limits prevent duplicate/concurrent research spending. A planning approval does not authorize publishing or spending.
3. **Steward profile and recurring execution:** onboarding captures mission, location, voice, useful services, cadence, boundaries and escalation contacts. Hosted workers consume the existing leased queues, with cancellation, retries, observability, and per-organization budgets. Recall only relevant scoped memory; write back sourced facts and commitments.
4. **Authorized community channels:** six optional choices remain X.com, Eventbrite, Facebook, Reddit, Nextdoor, Instagram. Verify actual capabilities and approvals per provider before implementation. A selection is not a connection. Account authorization is not a running worker. Add owned-channel ingestion first, with review queues for unsupported channels.
5. **Action approvals and event execution:** bind each proposed outbound action to exact content, recipient/channel, time, and any amount. Editing invalidates approval. Record delivery evidence; never mark a task delivered because it was drafted. Add venues, event milestones, opted-in invitations, registrations, and post-event follow-up.
6. **Pilot readiness:** full authenticated browser flows, live funded provider smoke test, isolation/role/approval regression tests, failure recovery, retention/deletion controls, accessibility, usage reporting, and measured staff time saved. Do not call this autonomous production software before these checks pass.

## Dashboard information hierarchy

- Today: unresolved needs, plans awaiting review, follow-ups due, actual research usage.
- Community needs: question / resource / concern / gathering interest / celebration; source, priority, status.
- Steward plans: the need, useful contribution, connection opportunity, gathering criteria, follow-up and outcomes.
- Research: explicit user request, provider readiness vs verified success, saved sources, failure recovery.
- Knowledge and platforms: link to existing directory, shared knowledge, private worker memory and connection choices.

The initial planning loop is human-initiated. It must not claim to monitor social networks, send messages, execute events, or run continuously until the associated integration and hosted worker exist.
