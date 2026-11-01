# CiviMeet roadmap

- [x] Organizer Chat voice controls through linked ElevenLabs: authorized token endpoint, explicit microphone start, cleanup, disabled unconfigured demo, tests and setup documentation; no outbound actions
- [x] Configure existing private ElevenLabs planning agent and server agent setting; updated isolation check passed and authenticated preview voice status returned ready
- [ ] Verify actual voice/audio in a separately authorized session (not attempted: no token or microphone started); voice is isolated discussion, not the organization-memory/orchestrator path, and phone outreach stays disabled

- [x] Replace Contact and Get Started with a stored demo request form; verified submission, private storage, and follow-up through Lovable Cloud
- [x] Prepare managed app emails and fixed-recipient demo notification template for notify.civimeet.com
- [ ] Enable and verify demo emails to support@civimeet.com (blocked on notify.civimeet.com DNS verification)

- [x] Google Analytics report uploads with authenticated, streamed AI traffic analysis and conversion recommendations

- [x] Public site: home, product, how it works, solutions, pricing, about, contact, draft legal pages
- [x] Uploaded logo in header/footer/sign-in + tab icon
- [x] Enable Lovable Cloud; sign up/in/out, organization creation and role-enforced vendor workspace
- [ ] Password reset, team invitations and membership management UI
- [ ] 7-step organization onboarding → /dashboard
- [x] Community dashboard: real overview counts, community needs, plans, follow-up dates, research history, activity, quick actions
- [x] Chat-first workspace: expandable sidebar (Chat, Search, Feed, Ideas, Goals, Events, Library, agent-made work), Main Agent plus one agent chat per connected platform
- [x] Agent panel beside chat: activity, inline approvals with history, browser (take over / give back for connected accounts, supervised web browser for the main agent), memory, stop/resume per platform agent
- [x] Platform agent memory: playbook and saved notes loaded into every conversation; each completed exchange saved as a 90-day note; six-turn thread history
- [x] Conversational Civi: personality and per-platform roles loaded into chat; event planning gathers format, place, date, size, purpose and budget through questions, then one click creates the event and starts vendor/venue discovery (or invitations for virtual events); chat replies kept out of shared knowledge; agent can open cited pages in its Steel browser
- [x] Task plans: goals in chat become durable plans (steps, owner agent, dependencies, level, lease, verified status); runner executes research, venue/vendor research, drafts to Approvals, event creation and connection checks; platform actions wait for connection and approval; live plan card in chat and Now/Needs you/Up next/Done in the agent panel (docs/agentic-execution.md)
- [ ] Scheduled runner (pg_cron + pg_net) so plans advance without an open workspace
- [ ] Agent task runner: execute queued work in the agent browser (post, comment, join, message) with approvals, pacing and stop
- [x] Authenticated Perplexity research with durable organization limits, idempotency, sources, usage and saved shared memory; private /agent preview retained
- [x] Live Perplexity acceptance test (2026-11-01): server key accepted by /v1/agent (200, search results + answer); production research run completed with 10 sources. Legacy /chat/completions returns agent_api_migration_required and is not used
- [x] Contribution-first team planning, exact-revision review, approval invalidation after edits, and recorded outcomes
- [ ] AI-generated plans, steward onboarding/profile, and hosted recurring workflows
- [x] Vendor directory, sourced discoveries, organization knowledge, private platform-agent memory and isolated work queues
- [x] Connections page: grouped list with brand logos and live status; live sign-in in the agent's Steel browser, encrypted saved logins with per-platform sign-in playbooks and security-check handoff, official OAuth (Google Calendar, Zoom, Facebook Pages, Instagram business, LinkedIn, Eventbrite); comment safety (approve each, daily cap, auto-pause, 14-day autopilot lock)
- [ ] Register OAuth apps and add their secrets; verify saved-login playbooks against live platform sign-in pages
- [ ] Community management, venue directory and hosted agent workers
- [ ] Events wizard, RSVPs, Contacts, Communications, Approvals, Calendar
- [ ] Analytics, Integrations, Settings, demo environment (labeled sample data)
