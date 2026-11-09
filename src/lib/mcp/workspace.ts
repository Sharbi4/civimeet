import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, type UserDatabase } from "./supabase";

export const organizationIdInput = z
  .string()
  .uuid()
  .optional()
  .describe(
    "Organization ID from list_organizations. Optional when you belong to exactly one organization.",
  );

type Membership = { role: string; organization: { id: string; name: string } | null };

/** Organizations the verified caller belongs to, read through their own permissions. */
export async function listMemberships(db: UserDatabase, userId: string) {
  const { data, error } = await db
    .from("organization_members")
    .select("role, organization:organizations(id,name)")
    .eq("user_id", userId);
  if (error) throw new ToolError("Could not read your organizations right now.");
  return ((data ?? []) as unknown as Membership[])
    .filter((m): m is Membership & { organization: { id: string; name: string } } => !!m.organization)
    .map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role }));
}

/**
 * Resolves which organization a tool acts on. Identity always comes from the verified
 * token; the caller can only pick among organizations they are a member of.
 */
export async function workspaceFor(ctx: ToolContext, organizationId?: string) {
  const userId = ctx.getUserId();
  if (!ctx.isAuthenticated() || !userId) throw new ToolError("Sign in to CiviMeet to use this tool.");
  const db = supabaseForUser(ctx);
  const memberships = await listMemberships(db, userId);
  if (memberships.length === 0)
    throw new ToolError("Your account isn't a member of any CiviMeet organization yet.");
  if (organizationId) {
    const match = memberships.find((m) => m.id === organizationId);
    if (!match)
      throw new ToolError("You aren't a member of that organization. Use list_organizations to see yours.");
    return { db, userId, organization: match };
  }
  if (memberships.length > 1)
    throw new ToolError(
      `You belong to ${memberships.length} organizations. Pass organizationId (see list_organizations).`,
    );
  return { db, userId, organization: memberships[0]! };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function textList(heading: string, lines: string[], empty: string) {
  return lines.length === 0 ? empty : `${heading}\n${lines.map((l) => `- ${l}`).join("\n")}`;
}
