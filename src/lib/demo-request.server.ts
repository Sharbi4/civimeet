import { demoRequestSchema, type DemoRequestResult } from "./demo-request";

// This is a public lead-capture action, not a general-purpose privileged writer.
export async function saveDemoRequest(input: unknown): Promise<DemoRequestResult> {
  const parsed = demoRequestSchema.safeParse(input);
  if (!parsed.success) return { saved: false, error: "Check the form and try again." };
  const data = parsed.data;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("demo_requests").insert({
    name: data.name,
    email: data.email,
    organization: data.organization,
    organization_type: data.organizationType,
    message: data.message,
    source: data.source,
    submission_key: data.submissionKey,
  });
  // Replays of the same browser submission must not create another lead.
  if (error && error.code !== "23505") {
    return { saved: false, error: "Your request could not be saved. Please try again." };
  }
  return { saved: true };
}