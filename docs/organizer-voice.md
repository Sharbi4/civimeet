# Organizer Chat voice setup and limits

## Connector

The accessible workspace connection named **ElevenLabs** is linked through Lovable's native connector. Its server-only `ELEVENLABS_API_KEY` is synchronized automatically. Calls go directly to ElevenLabs; this is not a gateway-backed connection. Do not paste a key into chat or add a browser-facing key. The connection was verified with a read-only account request.

## Remaining setup

Set `ELEVENLABS_AGENT_ID` in Project Settings → Secrets to a dedicated, private preparation-only agent. No agent or voice ID has been chosen or created. Configure authentication, transcript events, and an agent prompt that only discusses planning and drafting; it must not claim actions were executed. Use the agent's configured voice (no separate voice ID required).

Remove all tools (including client, server, webhook, MCP and phone tools), shared knowledge bases, procedures, workflows and persistent cross-session personalization. Disable client configuration overrides. The endpoint inspects configuration on every status/start and fails closed on unsupported settings. The connector key needs agent-read and conversation-token permissions. Unknown provider schemas require review rather than enabling voice automatically.

## What works

- Organization editor membership is checked server-side against the requested organization before any provider call; owner, admin and organizer roles are eligible.
- Only explicit Start obtains a fresh WebRTC conversation token and starts microphone capture through the SDK. Tokens are never cached or written to storage. Status reads do not obtain tokens.
- Stop, unmount, organization/thread changes cancel pending requests, disconnect active sessions, and ignore stale events. Transcript clear affects local display; organization/thread changes discard local transcript.
- Voice is isolated discussion, not an alternative executor. It cannot fetch organization knowledge, mutate memory, approve or execute tasks. Existing text research, scoped memory and approvals remain unchanged.
- Without valid configuration the actual workspace shows **Voice demo disabled**, with Start disabled and no simulated conversation.

## Capability and security gaps

- No live agent session was opened during implementation/testing. Control tests use mocked sessions, explicitly not live voice. Real microphone/audio and provider event timing remain unverified until the private agent is configured.
- ElevenLabs's WebRTC token reference does not document an exact TTL or an organization/thread cryptographic binding. The app issues tokens just in time following membership checks and echoes scope for UI validation; it cannot enforce a provider TTL, immediate revocation, or prevent a copied token being used outside the UI. Do not claim these guarantees. Signed URL 15-minute expiry must not be presented as a WebRTC token TTL.
- Agent configuration can change after inspection; provider version locking and ongoing membership revocation during a session are not implemented. Keep this dedicated agent private, tool-free and configuration-controlled. No organization memory is transmitted to mitigate scope leakage.
- Clearing the transcript does not delete ElevenLabs-held audio/transcripts. Configure provider retention before production use; no transcript persistence is added to CiviMeet.
- No telephony is configured or implemented. Phone outreach is disabled. Enabling it requires a separate server executor with verified telephony, administrator approval bound to exact recipient/script/org/revision, idempotency, and no cold political calls. No call, post, message, booking, or payment was made in this work.

References: [WebRTC token](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token), [authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication), [agent configuration](https://elevenlabs.io/docs/eleven-agents/api-reference/agents/get).

## Changed files and verification

- `src/components/workspace/OrganizerVoice.tsx` — consent, session lifecycle and transcript controls.
- `src/components/workspace/OrganizerChat.tsx` — voice controls in live chat.
- `src/lib/organizer-voice.server.ts` — authenticated membership, isolated-agent validation and token issuance.
- `src/routes/api.organizer.voice.ts` — voice HTTP boundary.
- `src/routes/dashboard.tsx` — workspace metadata.
- `src/test/organizer-voice.test.ts`, `src/test/organizer-voice-controls.test.tsx` — targeted boundary/control tests.
- `package.json`, `bun.lock` — ElevenLabs client SDK.
- `AGENTS.md`, `roadmap.md`, this document — safeguards, setup and remaining blocker.

All 48 selected voice/workspace/Perplexity/Steel regression tests passed. Build telemetry reports clean. Signed-in browser verification in the actual organization confirmed disabled Start and the unconfigured voice state; no microphone or live agent session was started. A screenshot was captured but visual inspection was unavailable, so verification rests on the rendered browser controls and text. Existing history was not changed; no framework or research/browser provider was replaced. No deployment was performed.