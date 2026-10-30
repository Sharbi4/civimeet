import { z } from "zod";

export const researchInputSchema = z.object({
  question: z.string().trim().min(10, "Enter a question of at least 10 characters.").max(3000),
  location: z.string().trim().max(160).default(""),
  purpose: z.enum(["resources", "venues", "vendors", "events", "general"]),
});

export type ResearchInput = z.infer<typeof researchInputSchema>;
export type ResearchResult = {
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
