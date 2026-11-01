# ElevenLabs voice planning → CiviMeet Perplexity research

## Current state

CiviMeet has a client-tool adapter in `src/lib/elevenlabs-planning.ts` that calls the
existing authenticated `/api/research` endpoint with the `event_design` Perplexity
skill. It uses the signed-in user's organization and JWT, and the existing
organization-editor check, saved research history and ten-request daily limit.

**Voice preparation is already integrated into Organizer Chat**, using `@elevenlabs/client`, the private `CiviMeet — Private Planning Assistant` agent, encrypted server-side `ELEVENLABS_AGENT_ID`, and a membership-checked `/api/organizer/voice` token endpoint. The agent has passed an isolation read-back and signed-in readiness check, but an actual microphone/audio conversation has **not** been verified. This agent is intentionally **tool-free** and cannot access organization research today. The adapter below is not yet registered as an ElevenLabs client tool. Do not claim voice-driven research is live until it passes an end-to-end test.

## Implementation checklist

1. **Reuse** the configured private **CiviMeet — Private Planning Assistant** agent unless it cannot support a narrowly scoped research tool safely. Do not create a duplicate by default. Its voice is Sarah; authentication is enabled, recording disabled, and zero-retention mode enabled. Keep explicit AI disclosure and no-unauthorized-action instructions.
2. In ElevenLabs configure an **allowlisted client tool** named `startPlanningResearch` with `request` (required) and optional `location`. The agent's current isolation validator in `src/lib/organizer-voice.server.ts` rejects **every tool**. Carefully extend the validator to permit **only** this exact client-tool schema while still failing closed on server tools, arbitrary URLs, MCP, knowledge bases, workflows, and permission overrides. Update security tests. If isolation cannot be maintained, keep the voice agent tool-free and present a separate explicitly authorized research mode.
3. The workspace already uses `@elevenlabs/client` in `src/components/workspace/OrganizerVoice.tsx` with `Conversation.startSession`, `clientTools: {}`, and membership-scoped `/api/organizer/voice`. Register the adapter in that **existing** session after permission checks; do not replace the voice implementation or switch SDKs unnecessarily:

   ```tsx
   const { db, organizationId, role } = useWorkspace();
   const tools = createVoicePlanningTools({
     organizationId,
     accessToken: async () => (await db.auth.getSession()).data.session?.access_token ?? null,
   });
   // Pass tools as clientTools only for authorized organization editors.
   ```

4. Retain the existing authenticated `/api/organizer/voice` WebRTC-token endpoint and `ELEVENLABS_API_KEY` server secret. Preserve its organization membership checks, explicit microphone consent, cancellation, organization/thread switch cleanup and private agent configuration validation. Do not expose token or JWT to the model; do not claim cryptographic binding of the token to the org where the provider does not document it.
5. Run an actual voice session: say “Plan a neighborhood resource fair in Tucson
   next month.” Confirm it saves a sourced run to the selected organization's
   **Main Organizer Chat**, returns useful citations and never sends outreach
   or moves money.
6. Test wrong-tenant access, viewer denial, expired session, duplicate requests,
   daily quota, long Perplexity latency, conversation interruptions, and errors.

## Operational caveat

The existing research endpoint may wait up to 90 seconds for Perplexity. For a
responsive voice experience, the next iteration should enqueue the job and
immediately return a run ID, then let the voice agent poll status or receive a
completion update. The initial client-tool adapter is synchronous and should
not be marketed as background autonomous execution.

## Honest time-value messaging

The homepage includes an **illustrative calculator** using the U.S. Bureau of
Labor Statistics May 2025 median hourly wage for event planners ($29.41/hour):

> Potential planning hours reclaimed per month = user-supplied hours per event
> × user-supplied events per month.

> Equivalent staff-time value = potential hours × $29.41.

The hours are _not measured CiviMeet savings_. Avoid guaranteed "save X hours"
or cash ROI claims until pilots compare time spent per task before and after
adoption, net of review effort and subscription/usage costs.

Source: https://www.bls.gov/ooh/business-and-financial/meeting-convention-and-event-planners.htm

ElevenLabs reference: https://elevenlabs.io/docs/eleven-agents/libraries/react
