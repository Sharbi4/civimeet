import { z } from "zod";
import { vendorDetailsSchema, publicUrl, linkPlatforms } from "./vendors";

export const localDiscoverySchema = z.object({
  summary: z.string().trim().min(10).max(12000),
  vendors: z
    .array(
      z.object({
        details: vendorDetailsSchema,
        source_url: publicUrl,
        source_excerpt: z.string().trim().min(10).max(4000),
        links: z.array(z.object({ platform: z.enum(linkPlatforms), url: publicUrl })).max(12),
      }),
    )
    .max(5),
  plan: z
    .object({
      title: z.string().trim().min(3).max(200),
      contribution: z.string().trim().min(10).max(4000),
      connection: z.string().trim().max(4000),
      gathering: z.string().trim().max(4000),
      follow_up: z.string().trim().min(3).max(4000),
    })
    .nullable(),
});
export type LocalDiscovery = z.infer<typeof localDiscoverySchema>;
export const localDiscoveryInstructions = `Return ONLY a JSON object, no markdown, with this shape:
{"summary":"Sourced research brief with citations and uncertainties","vendors":[{"details":{"name":"Business name","category":"category","service_areas":["published service area"],"contact_name":"","email":"","phone":"","notes":"Why relevant; what remains unconfirmed"},"source_url":"exact URL from search results","source_excerpt":"Brief evidence summary, not an invented quotation","links":[{"platform":"website","url":"exact business profile URL from search results"}]}],"plan":{"title":"Proposed gathering","contribution":"Useful first contribution","connection":"Draft outreach for organization review, never sent","gathering":"Proposed concept, venue criteria, estimated budget explicitly marked estimate, accessibility, volunteer responsibilities and RSVP plan","follow_up":"Concrete next steps for verifying vendors and inviting opted-in attendees"}}.
Find up to FIVE real local businesses appropriate to the community brief and event goal. Only public BUSINESS contact information, never private resident details. Unknown strings must be empty and unknown service areas must be []. Never invent email, phone, social profiles, prices, availability or attendance. Source and business-profile links must exactly match search-result URLs. General articles are evidence, never business identity links. Distinguish evidence from model inference. A cited URL does not mean a contact field is verified. Return no vendors when evidence is insufficient. A plan is a draft, not a booking or a live event; use null if there is insufficient community context. Do not claim outreach, login, or registration actions occurred.`;

export function parseLocalDiscovery(answer: string, sources: { url: string }[]): LocalDiscovery {
  const parsed = localDiscoverySchema.parse(
    JSON.parse(answer.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")),
  );
  const evidence = new Set(sources.map((s) => new URL(s.url).href));
  return {
    ...parsed,
    vendors: parsed.vendors
      .filter((v) => evidence.has(new URL(v.source_url).href))
      .map((v) => ({
        ...v,
        links: v.links.filter((link) => evidence.has(new URL(link.url).href)),
      })),
  };
}
