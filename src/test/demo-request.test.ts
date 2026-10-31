import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoRequestSchema } from "@/lib/demo-request";

const { insert, from } = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
import { saveDemoRequest } from "@/lib/demo-request.server";

export const valid = { name: "Demo Visitor", email: "visitor@example.org", organization: "Example Community", organizationType: "nonprofit", message: "Community event planning", source: "contact", submissionKey: "5f68ea74-8177-4c88-8ed8-dbc3483369a1", website: "" };
beforeEach(() => { vi.clearAllMocks(); from.mockReturnValue({ insert }); insert.mockResolvedValue({ error: null }); });
describe("demo request storage", () => {
  it("saves the visitor's details for follow-up", async () => {
    expect(await saveDemoRequest(valid)).toEqual({ saved: true });
    expect(from).toHaveBeenCalledWith("demo_requests");
    expect(insert).toHaveBeenCalledWith({ name: "Demo Visitor", email: "visitor@example.org", organization: "Example Community", organization_type: "nonprofit", message: "Community event planning", source: "contact", submission_key: valid.submissionKey });
  });
  it("rejects invalid input before saving", async () => {
    expect((await saveDemoRequest({ ...valid, email: "not-an-email" })).saved).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejects honeypot and unexpected fields", () => {
    expect(demoRequestSchema.safeParse({ ...valid, website: "spam" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, to: "attacker@example.org" }).success).toBe(false);
  });
  it("does not claim success on storage failure", async () => {
    insert.mockResolvedValue({ error: { code: "42501" } });
    expect((await saveDemoRequest(valid)).saved).toBe(false);
  });
  it("handles a repeated submission without adding a duplicate", async () => {
    insert.mockResolvedValue({ error: { code: "23505" } });
    expect((await saveDemoRequest(valid)).saved).toBe(true);
  });
});