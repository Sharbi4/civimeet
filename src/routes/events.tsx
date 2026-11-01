import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, MapPin, Wallet } from "lucide-react";
import { WorkspaceGate, useWorkspace } from "@/components/workspace/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { dollarsToCents, formatMoney } from "@/lib/event-money";
import { LocalDiscoveryPanel } from "@/components/workspace/LocalDiscoveryPanel";
import { OrganizerChat } from "@/components/workspace/OrganizerChat";
export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [{ title: "Community Gatherings — CiviMeet" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <WorkspaceGate>
      <Events />
    </WorkspaceGate>
  ),
});
type Event = {
  id: string;
  plan_id: string | null;
  title: string;
  purpose: string;
  event_date: string;
  venue: string;
  geographic_area: string;
  budget_cents: number;
  status: string;
  revision: number;
  outcome: string;
};
type Payment = {
  id: string;
  event_id: string;
  vendor_id: string;
  description: string;
  amount_cents: number;
  quote_url: string;
  status: string;
};
const blank = () => ({
  title: "",
  purpose: "",
  event_date: "",
  venue: "",
  geographic_area: "",
  budget: "0",
  plan_id: "",
});
const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
export function Events() {
  const { db, organizationId, role } = useWorkspace();
  const admin = ["owner", "admin"].includes(role);
  const editor = role !== "viewer";
  const [events, setEvents] = useState<Event[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [plans, setPlans] = useState<{ id: string; title: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selected = events.find((event) => event.id === selectedId);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Event | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [proposal, setProposal] = useState({ vendor: "", description: "", amount: "", source: "" });
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const results = await Promise.all([
      db
        .from("community_events")
        .select("*")
        .eq("organization_id", organizationId)
        .order("event_date", { ascending: false })
        .limit(100),
      db
        .from("vendors")
        .select("id,name")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("name")
        .limit(100),
      db
        .from("steward_plans")
        .select("id,title")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);
    if (results.some((result) => result.error))
      throw new Error("Could not load your event plans. Please refresh.");
    setEvents((results[0]!.data ?? []) as Event[]);
    setVendors(results[1]!.data ?? []);
    setPlans(results[2]!.data ?? []);
  }, [db, organizationId]);
  useEffect(() => {
    void load()
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false));
  }, [load]);
  const loadPayments = useCallback(async () => {
    if (!selectedId) {
      setPayments([]);
      return;
    }
    const { data, error: failure } = await db
      .from("event_payment_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("event_id", selectedId)
      .order("created_at", { ascending: false });
    if (failure) throw new Error("Could not load vendor costs.");
    setPayments((data ?? []) as Payment[]);
  }, [db, organizationId, selectedId]);
  useEffect(() => {
    let alive = true;
    setPayments([]);
    setProposal({ vendor: "", description: "", amount: "", source: "" });
    setOutcome("");
    if (!selectedId) return;
    db.from("event_payment_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("event_id", selectedId)
      .order("created_at", { ascending: false })
      .then(({ data, error: failure }) => {
        if (!alive) return;
        if (failure) setError("Could not load vendor costs.");
        else setPayments((data ?? []) as Payment[]);
      });
    return () => {
      alive = false;
    };
  }, [db, organizationId, selectedId]);
  async function action(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      await loadPayments();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this change.");
    } finally {
      setBusy(false);
    }
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error: failure } = await db.rpc(name, args);
    if (failure) throw new Error(failure.message);
    return data;
  }
  const approvedCosts = payments
    .filter((item) => item.status === "approved")
    .reduce((total, item) => total + Number(item.amount_cents), 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Meet Up</p>
          <h2 className="mt-2 text-3xl font-semibold">Gather with a purpose.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Turn real community interest into a thoughtful gathering. Keep the purpose, practical
            details, vendor choices, and budget together.
          </p>
        </div>
        {editor && (
          <Button
            onClick={() => {
              setError("");
              setNotice("");
              setEditing(null);
              setForm(blank());
              setShowForm(!showForm);
            }}
          >
            Plan a gathering
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border bg-muted p-4 text-sm">
          {notice}
        </p>
      )}
      {showForm && editor && (
        <form
          className="space-y-5 rounded-xl border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(form.event_date) || !form.geographic_area.trim()) {
              setError("Choose a date and event community area before saving.");
              return;
            }
            void action(async () => {
              const id = await rpc("save_community_event", {
                workspace: organizationId,
                event_data: { ...form, budget_cents: dollarsToCents(form.budget) },
                target_event: editing?.id ?? null,
                expected_revision: editing?.revision ?? null,
              });
              setSelectedId(id);
              setShowForm(false);
              setEditing(null);
              setForm(blank());
            }, "Event draft saved. Your team can review it before committing to costs.");
          }}
        >
          <h3 className="text-xl font-semibold">
            {editing ? "Update your gathering" : "Start with the community need"}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Gathering name">
              <Input
                required
                minLength={3}
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Related steward plan">
              <select
                className={selectClass}
                value={form.plan_id}
                onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
              >
                <option value="">Choose later</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Why would this gathering help?">
              <Textarea
                required
                minLength={10}
                maxLength={4000}
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </Field>
            <Field label="Proposed venue or location">
              <Textarea
                maxLength={500}
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
              />
            </Field>
            <Field label="Event community area">
              <Input
                required
                minLength={3}
                maxLength={160}
                value={form.geographic_area}
                onChange={(e) => setForm({ ...form, geographic_area: e.target.value })}
                placeholder="Orlando, Florida — Downtown and nearby neighborhoods"
              />
              <p className="text-xs text-muted-foreground">
                Where should your agent find communities and vendors? This can differ from your
                organization's home area. It does not change any account's address or access.
              </p>
            </Field>
            <Field label="Preferred date">
              <Input
                type="date"
                required
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              />
            </Field>
            <Field label="Maximum budget (USD)">
              <Input
                inputMode="decimal"
                required
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </Field>
          </div>
          {editing && (
            <p className="text-sm text-muted-foreground">
              Changes return this event to draft and invalidate its current vendor-cost approvals.
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={busy}>Save event draft</Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {loading ? (
        <p role="status">Loading gatherings…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.6fr]">
          <section className="space-y-3">
            <h3 className="font-semibold">Your gatherings · Up to 100</h3>
            {!events.length && (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No gatherings planned yet. Start when there is a community need worth bringing
                people together around.
              </p>
            )}
            {events.map((event) => (
              <button
                key={event.id}
                disabled={busy}
                onClick={() => setSelectedId(event.id)}
                className={`w-full rounded-xl border bg-card p-5 text-left ${selectedId === event.id ? "border-primary" : ""}`}
              >
                <p className="text-xs uppercase text-primary">{event.status}</p>
                <h4 className="mt-2 font-semibold">{event.title}</h4>
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays size={15} />
                  {event.event_date}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Budget {formatMoney(Number(event.budget_cents))}
                </p>
              </button>
            ))}
          </section>
          <section>
            {!selected ? (
              <div className="rounded-xl border bg-muted/40 p-10 text-center">
                <CalendarDays className="mx-auto text-primary" />
                <h3 className="mt-3 text-lg font-semibold">
                  A clear plan, from interest to follow-through
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose a gathering to review its purpose, vendors, budget, and next decisions.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <article className="rounded-xl border bg-card p-6">
                  <p className="text-xs uppercase text-primary">{selected.status}</p>
                  <h3 className="mt-2 text-2xl font-semibold">{selected.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{selected.purpose}</p>
                  <p className="mt-3 text-sm font-medium">
                    Community area:{" "}
                    {selected.geographic_area || "Add an area to focus your agent's research"}
                  </p>
                  <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin size={16} />
                    {selected.venue || "Venue to be researched"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Venue details are planning notes; a booking must be confirmed separately.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-muted p-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Planned budget</p>
                      <p className="mt-1 text-xl font-semibold">
                        {formatMoney(Number(selected.budget_cents))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Approved vendor costs</p>
                      <p className="mt-1 text-xl font-semibold">{formatMoney(approvedCosts)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {editor && ["draft", "approved"].includes(selected.status) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(selected);
                          setForm({
                            title: selected.title,
                            purpose: selected.purpose,
                            event_date: selected.event_date,
                            venue: selected.venue,
                            geographic_area: selected.geographic_area ?? "",
                            budget: (Number(selected.budget_cents) / 100).toFixed(2),
                            plan_id: selected.plan_id ?? "",
                          });
                          setShowForm(true);
                        }}
                      >
                        Edit plan
                      </Button>
                    )}
                    {admin && selected.status === "draft" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              rpc("review_community_event", {
                                target_event: selected.id,
                                expected_revision: selected.revision,
                                decision: "approve",
                              }),
                            "Event plan approved. Review vendor costs individually before payment.",
                          )
                        }
                      >
                        Approve event plan
                      </Button>
                    )}
                    {admin && ["draft", "approved"].includes(selected.status) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              rpc("review_community_event", {
                                target_event: selected.id,
                                expected_revision: selected.revision,
                                decision: "cancel",
                              }),
                            "Gathering cancelled and outstanding cost approvals withdrawn.",
                          )
                        }
                      >
                        Cancel gathering
                      </Button>
                    )}
                  </div>
                  {selected.outcome && (
                    <div className="mt-5 border-t pt-4">
                      <h4 className="font-semibold">What we learned</h4>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{selected.outcome}</p>
                    </div>
                  )}
                </article>
                {selected.geographic_area && ["draft", "approved"].includes(selected.status) && (
                  <section className="space-y-4" aria-label="Event community research">
                    <h3 className="text-lg font-semibold">
                      Build connections in {selected.geographic_area}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Research uses this event's saved area. It finds relevant communities and
                      vendors, saves findings to your organization, and prepares contributions for
                      review. No groups are joined or messages sent.
                    </p>
                    <LocalDiscoveryPanel
                      key={`vendors:${selected.id}:${selected.revision}`}
                      event={selected}
                      onSaved={() => void load()}
                    />
                    <details className="rounded-xl border bg-card p-4">
                      <summary className="cursor-pointer font-medium">
                        Plan a helpful presence in this community
                      </summary>
                      <div className="mt-4">
                        <OrganizerChat
                          key={`presence:${selected.id}:${selected.revision}`}
                          thread="main"
                          eventId={selected.id}
                        />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Results also appear in Main Organizer Chat, where you can prepare an exact
                        draft for the Approvals queue.
                      </p>
                    </details>
                  </section>
                )}
                <section className="space-y-4 rounded-xl border bg-card p-6">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Wallet size={18} /> Vendors & costs
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Compare sourced quotes and approve only what fits the event budget. Approval
                    does not charge the organization or pay the vendor.
                  </p>
                  {editor && ["draft", "approved"].includes(selected.status) && (
                    <form
                      className="space-y-3 rounded-lg bg-muted/40 p-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () => {
                          await rpc("propose_event_payment", {
                            target_event: selected.id,
                            target_vendor: proposal.vendor,
                            payment_description: proposal.description,
                            amount: dollarsToCents(proposal.amount),
                            quote_source: proposal.source,
                          });
                          setProposal({ vendor: "", description: "", amount: "", source: "" });
                        }, "Vendor cost proposed for review.");
                      }}
                    >
                      <Field label="Vendor from your directory">
                        <select
                          required
                          className={selectClass}
                          value={proposal.vendor}
                          onChange={(e) => setProposal({ ...proposal, vendor: e.target.value })}
                        >
                          <option value="">Choose a vendor</option>
                          {vendors.map((vendor) => (
                            <option key={vendor.id} value={vendor.id}>
                              {vendor.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {!vendors.length && (
                        <p className="text-xs text-muted-foreground">
                          Add sourced vendors to your directory first.
                        </p>
                      )}
                      <Field label="Service or deposit">
                        <Input
                          required
                          minLength={3}
                          maxLength={1000}
                          value={proposal.description}
                          onChange={(e) =>
                            setProposal({ ...proposal, description: e.target.value })
                          }
                        />
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Quoted amount (USD)">
                          <Input
                            required
                            inputMode="decimal"
                            value={proposal.amount}
                            onChange={(e) => setProposal({ ...proposal, amount: e.target.value })}
                          />
                        </Field>
                        <Field label="Quote or invoice link">
                          <Input
                            required
                            type="url"
                            maxLength={2048}
                            value={proposal.source}
                            onChange={(e) => setProposal({ ...proposal, source: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Button disabled={busy || !vendors.length} variant="outline">
                        Propose vendor cost
                      </Button>
                    </form>
                  )}
                  {!payments.length && (
                    <p className="text-sm text-muted-foreground">No vendor costs proposed yet.</p>
                  )}
                  {payments.map((payment) => (
                    <article key={payment.id} className="rounded-lg border p-4">
                      <div className="flex justify-between gap-3">
                        <h4 className="font-medium">
                          {vendors.find((v) => v.id === payment.vendor_id)?.name ??
                            "Vendor in your directory"}
                        </h4>
                        <strong>{formatMoney(Number(payment.amount_cents))}</strong>
                      </div>
                      <p className="mt-2 text-sm">{payment.description}</p>
                      <p className="mt-2 text-xs text-primary">
                        {payment.status === "approved"
                          ? "Cost approved · Not paid"
                          : payment.status}
                      </p>
                      <a
                        className="mt-2 block text-sm text-primary underline"
                        href={payment.quote_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Review quote
                      </a>
                      {admin && payment.status !== "rejected" && (
                        <div className="mt-3 flex gap-2">
                          {payment.status === "proposed" && (
                            <Button
                              size="sm"
                              disabled={busy || selected.status !== "approved"}
                              onClick={() =>
                                void action(
                                  () =>
                                    rpc("review_event_payment", {
                                      target_payment: payment.id,
                                      decision: "approve",
                                    }),
                                  "Vendor cost approved within the event budget. No money has moved.",
                                )
                              }
                            >
                              Approve cost
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void action(
                                () =>
                                  rpc("review_event_payment", {
                                    target_payment: payment.id,
                                    decision: "reject",
                                  }),
                                "Vendor cost approval withdrawn.",
                              )
                            }
                          >
                            Decline / withdraw
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Payments are not connected yet. Once enabled, your organization will fund
                    CiviMeet, and approved vendors will be paid from confirmed funds.
                  </p>
                </section>
                {admin && selected.status === "approved" && (
                  <form
                    className="space-y-4 rounded-xl border bg-card p-6"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(
                        () =>
                          rpc("review_community_event", {
                            target_event: selected.id,
                            expected_revision: selected.revision,
                            decision: "complete",
                            result_note: outcome,
                          }),
                        "Gathering outcome saved for future planning.",
                      );
                    }}
                  >
                    <h3 className="font-semibold">After the gathering</h3>
                    <Field label="What happened, and how should we follow through?">
                      <Textarea
                        required
                        minLength={10}
                        maxLength={4000}
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                      />
                    </Field>
                    <Button disabled={busy}>Record outcome & complete</Button>
                  </form>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col items-stretch gap-2 leading-5">
      <span>{label}</span>
      {children}
    </Label>
  );
}
