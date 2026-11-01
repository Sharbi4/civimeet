import { LocalDiscoveryPanel } from "@/components/workspace/LocalDiscoveryPanel";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { WorkspaceGate, useWorkspace } from "@/components/workspace/WorkspaceGate";
import { VendorFields } from "@/components/workspace/VendorFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  blankVendor,
  discoverySchema,
  linkPlatforms,
  vendorDetailsSchema,
  type Discovery,
  type PlatformAgent,
  type Vendor,
  type VendorDetails,
} from "@/lib/vendors";

export const Route = createFileRoute("/vendors")({
  head: () => ({
    meta: [{ title: "Vendor Directory — CiviMeet" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <WorkspaceGate>
      <VendorDirectory />
    </WorkspaceGate>
  ),
});

function VendorDirectory() {
  const { db, organizationId, role } = useWorkspace();
  const editable = role !== "viewer";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState<VendorDetails>(blankVendor);
  const [agentId, setAgentId] = useState("");
  const [source, setSource] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [links, setLinks] = useState<{ platform: (typeof linkPlatforms)[number]; url: string }[]>([
    { platform: "website", url: "" },
    { platform: "facebook", url: "" },
  ]);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [history, setHistory] = useState<Discovery[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [review, setReview] = useState<VendorDetails>(blankVendor);
  const [reviewStatus, setReviewStatus] = useState<Vendor["status"]>("needs_review");
  const retry = useRef({ fingerprint: "", key: "" });

  useEffect(() => {
    let alive = true;
    db.from("platform_agents")
      .select("*")
      .eq("organization_id", organizationId)
      .order("platform")
      .then(({ data, error: failure }) => {
        if (!alive) return;
        if (failure) {
          setError(failure.message);
          return;
        }
        const rows = (data ?? []) as PlatformAgent[];
        setAgents(rows);
        setAgentId(rows.find((agent) => agent.platform === "web")?.id ?? rows[0]?.id ?? "");
      });
    return () => {
      alive = false;
    };
  }, [db, organizationId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      db.rpc("search_vendor_directory", {
        workspace: organizationId,
        search_text: query,
        service_area: area,
        review_status: status,
        page_size: 25,
        page_offset: offset,
      }).then(({ data, error: failure }) => {
        if (!alive) return;
        setLoading(false);
        if (failure) {
          setError(failure.message);
          return;
        }
        setVendors(data.vendors);
        setTotal(data.total);
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [db, organizationId, query, area, status, offset, refresh]);

  function openVendor(vendor: Vendor) {
    setSelected(vendor);
    setReview(vendor);
    setReviewStatus(vendor.status);
    setAdding(false);
  }

  const selectedVendorId = selected?.id;
  useEffect(() => {
    setHistory([]);
    if (!selectedVendorId) return;
    let alive = true;
    setHistoryLoading(true);
    db.from("vendor_discoveries")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("vendor_id", selectedVendorId)
      .order("discovered_at", { ascending: false })
      .limit(50)
      .then(({ data, error: failure }) => {
        if (!alive) return;
        setHistoryLoading(false);
        if (failure) setError(failure.message);
        else setHistory((data ?? []) as Discovery[]);
      });
    return () => {
      alive = false;
    };
  }, [db, organizationId, selectedVendorId]);

  async function saveDiscovery() {
    setError("");
    setNotice("");
    const payload = {
      details: {
        ...details,
        service_areas: details.service_areas.map((entry) => entry.trim()).filter(Boolean),
      },
      source_url: source,
      source_excerpt: excerpt,
      links: links.filter((link) => link.url.trim()),
      ...(selected ? { vendor_id: selected.id } : {}),
    };
    const fingerprint = JSON.stringify({ agentId, payload });
    if (retry.current.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    const parsed = discoverySchema.safeParse({ ...payload, idempotency_key: retry.current.key });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the vendor details.");
      return;
    }
    if (!agentId) {
      setError("Choose the platform where this was found.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: failure } = await db.rpc("save_vendor_discovery", {
        agent_id: agentId,
        discovery: parsed.data,
      });
      if (failure) throw failure;
      setNotice(
        data.possible_duplicate_ids?.length
          ? "Saved for review. Another vendor has the same name; check both records before planning an event."
          : "Discovery saved with its source. Matching business links are attached to the existing vendor.",
      );
      setAdding(false);
      setSelected(null);
      setDetails(blankVendor);
      setSource("");
      setExcerpt("");
      setLinks([
        { platform: "website", url: "" },
        { platform: "facebook", url: "" },
      ]);
      retry.current = { fingerprint: "", key: "" };
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : String((failure as { message?: string }).message ?? "Could not save the discovery."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveReview() {
    if (!selected) return;
    setError("");
    const parsed = vendorDetailsSchema.safeParse({
      ...review,
      service_areas: review.service_areas.map((entry) => entry.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the vendor details.");
      return;
    }
    setBusy(true);
    const { error: failure } = await db.rpc("review_vendor", {
      target_vendor: selected.id,
      details: parsed.data,
      review_status: reviewStatus,
    });
    setBusy(false);
    if (failure) setError(failure.message);
    else {
      setNotice("Vendor review saved.");
      setSelected(null);
      setRefresh((value) => value + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Vendor directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shared business knowledge from all of your organization's platform agents.
          </p>
        </div>
        {editable && (
          <Button
            onClick={() => {
              setAdding(true);
              setSelected(null);
              setDetails(blankVendor);
            }}
          >
            Add discovery
          </Button>
        )}
      </div>
      <LocalDiscoveryPanel onSaved={() => setRefresh((value) => value + 1)} />
      {error && (
        <p role="alert" className="rounded-md border p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      {adding && (
        <form
          className="space-y-5 rounded-lg border p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDiscovery();
          }}
        >
          <h3 className="text-lg font-semibold">
            {selected ? `Add evidence to ${selected.name}` : "Save a business discovery"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Record public business details and their source. This will be marked for review.
          </p>
          <VendorFields value={details} onChange={setDetails} prefix="new-vendor" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="discovery-platform">Found on platform</Label>
              <select
                id="discovery-platform"
                className="w-full rounded-md border bg-background p-2"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.platform}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discovery-source">Source URL</Label>
              <Input
                id="discovery-source"
                type="url"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={2048}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="discovery-excerpt">Source evidence / excerpt</Label>
            <Textarea
              id="discovery-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={4000}
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="font-medium">Business website and social pages</legend>
            <p className="text-xs text-muted-foreground">
              Use pages belonging to this business. A community post or directory article belongs in
              Source URL above.
            </p>
            {links.map((link, index) => (
              <div key={index} className="flex gap-2">
                <select
                  aria-label={`Link ${index + 1} platform`}
                  className="rounded-md border bg-background p-2"
                  value={link.platform}
                  onChange={(e) =>
                    setLinks(
                      links.map((item, i) =>
                        i === index
                          ? { ...item, platform: e.target.value as typeof link.platform }
                          : item,
                      ),
                    )
                  }
                >
                  {linkPlatforms.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
                <Input
                  aria-label={`Link ${index + 1} URL`}
                  type="url"
                  value={link.url}
                  onChange={(e) =>
                    setLinks(
                      links.map((item, i) =>
                        i === index ? { ...item, url: e.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() => setLinks(links.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={links.length >= 12}
              onClick={() => setLinks([...links, { platform: "other", url: "" }])}
            >
              Add business link
            </Button>
          </fieldset>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save discovery"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {selected && !adding && (
        <section className="space-y-5 rounded-lg border p-6">
          <div className="flex justify-between gap-3">
            <h3 className="text-xl font-semibold">{selected.name}</h3>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Last verified:{" "}
            {selected.verified_at
              ? new Date(selected.verified_at).toLocaleString()
              : "Not verified"}
          </p>
          {editable && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void saveReview();
              }}
            >
              <VendorFields value={review} onChange={setReview} prefix="review-vendor" />
              <Label htmlFor="review-status">Review status</Label>
              <select
                id="review-status"
                className="ml-3 rounded-md border bg-background p-2"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as Vendor["status"])}
              >
                <option value="needs_review">Needs review</option>
                <option value="verified">Verified by me</option>
                <option value="archived">Archived</option>
              </select>
              <div className="flex gap-3">
                <Button disabled={busy} type="submit">
                  Save review
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setDetails(selected);
                    setAdding(true);
                  }}
                >
                  Add another discovery
                </Button>
              </div>
            </form>
          )}
          <h4 className="font-semibold">Discovered business links</h4>
          <ul className="space-y-2">
            {selected.links.map((link) => (
              <li key={link.url}>
                <a
                  className="break-all text-sm text-primary underline"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.platform}: {link.url}
                </a>
              </li>
            ))}
          </ul>
          <h4 className="font-semibold">Latest 50 discoveries</h4>
          {historyLoading && <p role="status">Loading source history…</p>}
          {history.map((entry) => (
            <article key={entry.id} className="space-y-2 rounded-md border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">
                {agents.find((agent) => agent.id === entry.agent_id)?.platform ?? "Platform"} ·
                Recorded by {entry.recorded_via} · {new Date(entry.discovered_at).toLocaleString()}
              </p>
              <a
                href={entry.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-primary underline"
              >
                {entry.source_url}
              </a>
              <p className="whitespace-pre-wrap text-sm">{entry.source_excerpt}</p>
              <p className="text-sm">
                {entry.details.name} · {entry.details.service_areas.join(", ")} ·{" "}
                {entry.details.email} · {entry.details.phone}
              </p>
              {editable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReview(entry.details);
                    setReviewStatus("needs_review");
                  }}
                >
                  Use these details in review
                </Button>
              )}
            </article>
          ))}
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          aria-label="Search vendor name or category"
          placeholder="Search vendor or category"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
        <Input
          aria-label="Filter service area"
          placeholder="Service area"
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setOffset(0);
          }}
        />
        <select
          aria-label="Filter review status"
          className="rounded-md border bg-background p-2"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All statuses</option>
          <option value="needs_review">Needs review</option>
          <option value="verified">Verified</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      {loading ? (
        <p role="status">Loading vendors…</p>
      ) : !vendors.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <h3 className="font-semibold">No matching vendors yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a sourced discovery or connect a platform worker to begin collecting business
            knowledge.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {vendors.map((vendor) => (
            <article key={vendor.id} className="rounded-lg border p-5">
              <div className="flex justify-between gap-2">
                <h3 className="font-semibold">{vendor.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {vendor.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-sm">{vendor.category || "Category not provided"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {vendor.service_areas.join(", ") || "Service area not provided"}
              </p>
              <p className="mt-2 break-all text-sm">
                {vendor.email || vendor.phone || "Contact details not yet collected"}
              </p>
              <Button
                className="mt-4"
                size="sm"
                variant="outline"
                onClick={() => void openVendor(vendor)}
              >
                View details and sources
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} matching vendors</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={offset + 25 >= total || loading}
            onClick={() => setOffset(offset + 25)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
