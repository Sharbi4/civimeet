import type { ResearchResult } from "./research";

type VoicePlanningInput = { request: string; location?: string };
type ResearchReply = {
  error?: string;
  run?: {
    id: string;
    status: "running" | "completed" | "failed";
    result?: ResearchResult | null;
  };
};

/**
 * ElevenLabs *client tool* adapter for a signed-in CiviMeet workspace.
 *
 * Register `startPlanningResearch` with ElevenLabs' React SDK only inside the
 * organization workspace. The voice model never receives the user's JWT or
 * chooses an organization. The existing research API enforces editor access,
 * daily usage limits and idempotent, durable research runs.
 *
 * This tool can research and prepare a draft; it cannot post, book or pay.
 */
export function createVoicePlanningTools(options: {
  organizationId: string;
  accessToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}) {
  return {
    async startPlanningResearch(input: VoicePlanningInput): Promise<string> {
      const question = typeof input.request === "string" ? input.request.trim() : "";
      if (question.length < 10 || question.length > 3000)
        return "Please describe the gathering in 10 to 3,000 characters.";
      const location = typeof input.location === "string" ? input.location.trim() : "";
      if (location.length > 160) return "Please shorten the location to 160 characters.";
      const token = await options.accessToken();
      if (!token) return "Sign in to your CiviMeet organization before starting research.";

      try {
        const response = await (options.fetcher ?? fetch)("/api/research", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            organizationId: options.organizationId,
            requestId: crypto.randomUUID(),
            question,
            location,
            purpose: "events",
            skillId: "event_design",
            threadKey: "main",
            includeKnowledge: false,
            collectVendors: false,
            agentId: null,
            planId: null,
          }),
        });
        const body = (await response.json()) as ResearchReply;
        if (!response.ok) {
          return response.status === 429
            ? "The organization's research limit was reached. Please try later."
            : "Planning research could not start. Check your CiviMeet research access.";
        }
        if (body.run?.status === "running")
          return "Your research is already running. Check the Main Organizer Chat for its result.";
        const result = body.run?.result;
        if (!result) return "Research was requested. Check the Main Organizer Chat for its status.";
        return JSON.stringify({
          status: "prepared_for_review",
          summary: result.answer.slice(0, 3200),
          sources: result.sources.slice(0, 5).map(({ title, url }) => ({ title, url })),
          nextStep:
            "Review the saved research in Main Organizer Chat. Nothing was sent, booked or paid.",
        });
      } catch {
        return "Research could not be confirmed. Check Main Organizer Chat before trying again.";
      }
    },
  };
}
