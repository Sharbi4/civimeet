import { z } from "zod";

export const organizationTypes = [
  { value: "nonprofit", label: "Nonprofit" },
  { value: "neighborhood", label: "Neighborhood association" },
  { value: "membership", label: "Membership organization" },
  { value: "civic", label: "Civic organization" },
  { value: "municipal", label: "Municipality" },
  { value: "community", label: "Community program" },
  { value: "other", label: "Other" },
] as const;

export const demoRequestSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  organization: z.string().trim().min(1, "Enter your organization.").max(150),
  organizationType: z.enum(["nonprofit", "neighborhood", "membership", "civic", "municipal", "community", "other"], { errorMap: () => ({ message: "Choose an organization type." }) }),
  message: z.string().trim().max(2000),
  source: z.enum(["contact", "get-started"]),
  submissionKey: z.string().uuid(),
  website: z.string().max(0, "Unable to submit this request."),
}).strict();

export type DemoRequest = z.infer<typeof demoRequestSchema>;
export type DemoRequestResult = { saved: boolean; error?: string };