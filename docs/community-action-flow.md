# Community action flow

The organization brief captures the coordinator, service area, mission, platform responsibilities, voice and gathering goals. It belongs to one organization; administrators edit it. Selecting a platform expresses intent, not a connected account or permission to publish.

The dashboard suggests reviewing drafts, following up on commitments, or researching an opportunity according to current records. Demo content is explicitly labeled and has not been validated as a real community need. The next-step rules are deterministic, not model-generated decisions.

Each platform has a persistent planning conversation backed by organization-scoped research runs tagged with its agent ID. The server validates the agent belongs to that organization and is selected/unpaused. Perplexity receives a bounded brief, platform instructions, and two recent completed conversation turns. Replies are sourced research and drafts, not proof of external execution. Members can read; editors can ask for a turn. The existing daily research quota and idempotency apply. No account credentials belong in these conversations.

The browser button selects that agent's separate workspace. Public-web sessions support approved navigation and snapshots. Social browser execution, credential autofill, unattended scheduling, and automatic cross-platform delegation are not shipped. The Community Steward will eventually route approved work to these platform conversations; it does not currently generate unattended prompts. A continuous-progress interface must not imply that a disconnected worker is running.

Facebook Page operations, group participation, Messenger, and channel creation must be modeled as separate capabilities. Each needs a verified supported connector and appropriate account authorization. Preparing text is available; posting, commenting, messaging, and creating channels are not represented as connected capabilities.

Next implementation work: hosted coordinator with bounded budgets and durable jobs; platform capability verification; credential vault integration with exact-origin and tenant isolation; verified human handoff; and action-specific approvals with outcome evidence. Preserve useful planning when a connector is unavailable, and present a focused next step instead of an idle control panel.
