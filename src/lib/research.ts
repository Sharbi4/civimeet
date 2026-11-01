import type { StewardSkillId } from "./steward-skills";
import type { LocalDiscovery } from "./local-discovery";
import { z } from "zod";

export const researchInputSchema = z.object({
  question: z.string().trim().min(10, "Enter a question of at least 10 characters.").max(3000),
  location: z.string().trim().max(160).default(""),
  purpose: z.enum(["resources", "venues", "vendors", "events", "general"]),
});

export type ResearchInput = z.infer<typeof researchInputSchema>;
export type ResearchResult = {
  localDiscovery?: LocalDiscovery;
  savedDiscovery?: { vendorCount: number; skippedCount: number; planId: string | null };
  skill?: { id: StewardSkillId; name: string; nextSkillId: StewardSkillId };
  provider: "perplexity";
  id: string;
  answer: string;
  sources: { id: number; title: string; url: string }[];
  model: string;
  researchedAt: string;
  usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
};

export type ResearchStatus = {
  configured: boolean;
  accessConfigured: boolean;
};
