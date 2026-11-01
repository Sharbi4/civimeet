# ElevenLabs voice planning → CiviMeet Perplexity research

## Current state

CiviMeet has a client-tool adapter in `src/lib/elevenlabs-planning.ts` that calls the
existing authenticated `/api/research` endpoint with the `event_design` Perplexity
skill. It uses the signed-in user's organization and JWT, and the existing
organization-editor check, saved research history and ten-request daily limit.

**The ElevenLabs voice session is not yet deployed or connected.** It needs a
configured ElevenLabs agent, an agent ID, and a private signed-session flow.
Do not describe live voice actions as available until those are tested.

## Implementation checklist

1. Configure a **private** ElevenLabs agent that clearly introduces itself as
   CiviMeet's AI. Give it instructions to gather an event goal, place, timeline,
   audience and constraints, without guessing missing facts. Never claim it
   posted, booked, contacted a person, charged a card or completed research
   when it only prepared a draft.
2. In the ElevenLabs agent UI, define a **client tool** named exactly
   `startPlanningResearch`, with `request` (required string) and `location`
   (optional string). Set the tool to **block the conversation until the result
   returns**; otherwise the agent may assume success early.
3. Integrate `@elevenlabs/react` inside the authenticated organization workspace
   with a `ConversationProvider`. Pass `clientTools` containing the adapter:

   ```tsx
   const { db, organizationId, role } = useWorkspace();
   const tools = createVoicePlanningTools({
     organizationId,
     accessToken: async () => (await db.auth.getSession()).data.session?.access_token ?? null,
   });

   // Register tools.startPlanningResearch with ConversationProvider clientTools.
   // Never register it for a viewer role. Keep the organization ID in the
   // app context, not in agent-supplied tool parameters.
   ```

4. Implement an authenticated, organization-scoped server endpoint to request
   an **ElevenLabs signed session URL/token**. Keep `ELEVENLABS_API_KEY` and
   agent ID on the server; do not expose a public agent with sensitive client
   tools. Use the official React SDK session flow after the signed session is
   issued to an authorized editor.
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
