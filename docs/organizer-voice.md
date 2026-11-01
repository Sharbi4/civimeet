# Organizer Chat voice setup and limits

## Connector

The accessible workspace connection named **ElevenLabs** is linked through Lovable's native connector. Its server-only `ELEVENLABS_API_KEY` is synchronized automatically. Calls go directly to ElevenLabs; this is not a gateway-backed connection. Do not paste a key into chat or add a browser-facing key. The connection was verified with a read-only account request.

## Verified setup

The existing dedicated **CiviMeet — Private Planning Assistant** has been read back and passed the updated `isIsolatedVoiceAgent` validator. `ELEVENLABS_AGENT_ID` is now set through Lovable's supported encrypted server-secret flow. The configured voice is Sarah; no separate voice secret is required. Authentication is required, voice recording is disabled, and zero-retention mode is enabled. Its greeting identifies it as CiviMeet's AI planning assistant and explicitly says it cannot access saved organization data or execute actions yet.

The read-back contains no populated tools, native MCP servers, shared knowledge, or procedures; every built-in tool is null and every client permission override is false. ElevenLabs supplies one inert `start_node` with empty edges and subgraphs, not an executable workflow. Its default WhatsApp channel behavior is distinct from client permission overrides. The endpoint inspects configuration on every status/start and fails closed on unsafe settings. Agent-read permission is verified; conversation-token issuance and permissions remain untested because no token was requested.

## What works

- Organization editor membership is checked server-side against the requested organization before any provider call; owner, admin and organizer roles are eligible.
- Only explicit Start obtains a fresh WebRTC conversation token and starts microphone capture through the SDK. Tokens are never cached or written to storage. Status reads do not obtain tokens.
- Stop, unmount, organization/thread changes cancel pending requests, disconnect active sessions, and ignore stale events. Transcript clear affects local display; organization/thread changes discard local transcript.
- Voice is isolated discussion, not an alternative executor. It cannot fetch organization knowledge, mutate memory, approve or execute tasks. Existing text research, scoped memory and approvals remain unchanged.
- Without valid configuration the actual workspace shows **Voice demo disabled**, with Start disabled and no simulated conversation.

## Capability and security gaps

- Configuration is ready in the signed-in local preview, not a verified live audio session. No conversation token, microphone, conversation or call was started during setup. Real microphone/audio, token issuance and provider event timing remain unverified pending separately authorized testing.
- Voice remains isolated planning discussion, not the same organization-memory/orchestrator path as text chat. It cannot read saved organization data or execute approval actions. No phone outreach is available.
- ElevenLabs's WebRTC token reference does not document an exact TTL or an organization/thread cryptographic binding. The app issues tokens just in time following membership checks and echoes scope for UI validation; it cannot enforce a provider TTL, immediate revocation, or prevent a copied token being used outside the UI. Do not claim these guarantees. Signed URL 15-minute expiry must not be presented as a WebRTC token TTL.
- Agent configuration can change after inspection; provider version locking and ongoing membership revocation during a session are not implemented. Keep this dedicated agent private, tool-free and configuration-controlled. No organization memory is transmitted to mitigate scope leakage.
- The provider read-back confirms zero-retention mode, voice recording disabled, and audio/transcript deletion settings enabled. Local transcript clearing is not a provider deletion operation; no transcript persistence is added to CiviMeet. Retention behavior has not been exercised with a live session.
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

### Setup completion verification

The updated local validator accepted a fresh provider configuration read. All 14 current server voice tests passed. In the real signed-in organization, `POST /api/organizer/voice` with `action: "status"` returned HTTP 200 and `{ "configured": true, "mode": "ready" }`; Organizer Chat displayed **Voice ready · preparation only** and enabled Start. Only status requests were made. This verifies the local preview, not the published deployment; no deployment was requested or performed. This completion changed only this document and `roadmap.md`, plus the supported server-secret setting; no application source or Git files were edited.