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
- [ ] AI Organizer workspace: chat, tasks, runtime abstraction, Live Agent Workspace panel
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
