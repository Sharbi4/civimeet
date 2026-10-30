import { z } from "zod";

export const platforms = ["web", "facebook", "instagram", "nextdoor", "reddit", "x"] as const;
export const linkPlatforms = [
  "website",
  "facebook",
  "instagram",
  "nextdoor",
  "reddit",
  "x",
  "other",
] as const;
export const publicUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  }, "Use a public HTTP or HTTPS link without credentials.");

export const vendorDetailsSchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(100),
  service_areas: z.array(z.string().trim().min(1).max(160)).max(20),
  contact_name: z.string().trim().max(160),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  phone: z.string().trim().max(60),
  notes: z.string().trim().max(4000),
});
export const discoverySchema = z.object({
  details: vendorDetailsSchema,
  source_url: publicUrl,
  source_excerpt: z.string().trim().max(4000),
  links: z.array(z.object({ platform: z.enum(linkPlatforms), url: publicUrl })).max(12),
  idempotency_key: z.string().uuid(),
  vendor_id: z.string().uuid().optional(),
});
export type VendorDetails = z.infer<typeof vendorDetailsSchema>;
export type Vendor = VendorDetails & {
  id: string;
  status: "needs_review" | "verified" | "archived";
  updated_at: string;
  verified_at: string | null;
  links: { platform: string; url: string }[];
};
export type PlatformAgent = {
  id: string;
  platform: (typeof platforms)[number];
  name: string;
  instructions: string;
  paused: boolean;
  last_collection_at: string | null;
};
export type Discovery = {
  id: string;
  agent_id: string;
  source_url: string;
  source_excerpt: string;
  details: VendorDetails;
  recorded_via: string;
  discovered_at: string;
};
export const blankVendor: VendorDetails = {
  name: "",
  category: "",
  service_areas: [],
  contact_name: "",
  email: "",
  phone: "",
  notes: "",
};
