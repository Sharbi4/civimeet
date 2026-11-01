import { describe, expect, it } from "vitest";
import { parseLocalDiscovery } from "@/lib/local-discovery";
const vendor = {
  details: {
    name: "Local Catering",
    category: "food",
    service_areas: ["Tucson"],
    contact_name: "",
    email: "",
    phone: "",
    notes: "Availability unknown",
  },
  source_url: "https://business.example/services",
  source_excerpt: "Business advertises local event catering.",
  links: [{ platform: "website", url: "https://business.example/" }],
};
const payload = { summary: "Local catering options with evidence.", vendors: [vendor], plan: null };
describe("structured local discovery evidence", () => {
  it("retains cited candidates and removes unsupported identity links", () => {
    const result = parseLocalDiscovery(JSON.stringify(payload), [{ url: vendor.source_url }]);
    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0]?.links).toEqual([]);
  });
  it("does not create a candidate from an uncited model URL", () => {
    expect(parseLocalDiscovery(JSON.stringify(payload), []).vendors).toEqual([]);
  });
  it("rejects malformed contacts and executable URLs", () => {
    expect(() =>
      parseLocalDiscovery(
        JSON.stringify({
          ...payload,
          vendors: [{ ...vendor, details: { ...vendor.details, email: "invented invalid email" } }],
        }),
        [],
      ),
    ).toThrow();
    expect(() =>
      parseLocalDiscovery(
        JSON.stringify({ ...payload, vendors: [{ ...vendor, source_url: "javascript:alert(1)" }] }),
        [],
      ),
    ).toThrow();
  });
  it("strips model-supplied tenant and vendor identifiers", () => {
    const result = parseLocalDiscovery(
      JSON.stringify({
        ...payload,
        vendors: [{ ...vendor, organization_id: "other", vendor_id: "other" }],
      }),
      [{ url: vendor.source_url }],
    );
    expect(result.vendors[0]).not.toHaveProperty("vendor_id");
    expect(result.vendors[0]).not.toHaveProperty("organization_id");
  });
  it("rejects an oversized batch and preserves unknown contact fields", () => {
    expect(() =>
      parseLocalDiscovery(JSON.stringify({ ...payload, vendors: Array(6).fill(vendor) }), []),
    ).toThrow();
    expect(
      parseLocalDiscovery(JSON.stringify(payload), [{ url: vendor.source_url }]).vendors[0]?.details
        .email,
    ).toBe("");
  });
});
