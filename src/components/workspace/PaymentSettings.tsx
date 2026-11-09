import { useCallback, useEffect, useState } from "react";
import { CreditCard, Landmark, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandLogo } from "./BrandLogo";
import { dollarsToCents, formatMoney } from "@/lib/event-money";
import {
  categoryLabels,
  decidePayment,
  paymentCategories,
  statusLabels,
  validateSettings,
  type PaymentCategory,
  type PaymentSettings as Settings,
} from "@/lib/agent-payments";

export type PaymentRow = {
  id: string;
  agent: string;
  payee: string;
  purpose: string;
  category: PaymentCategory;
  amount_cents: number;
  status: string;
  approval: string;
  over_budget: boolean;
  created_at: string;
};
type Backend = {
  load: () => Promise<{ settings: Settings | null; payments: PaymentRow[] }>;
  save: (settings: Settings) => Promise<void>;
  request: (input: {
    payee: string;
    purpose: string;
    category: PaymentCategory;
    cents: number;
  }) => Promise<void>;
  review: (id: string, decision: "approve" | "reject") => Promise<void>;
};

const month = () => new Date().toISOString().slice(0, 7) + "-01";

export function livePaymentsBackend(db: SupabaseClient, organizationId: string): Backend {
  return {
    async load() {
      const [settings, payments] = await Promise.all([
        db
          .from("organization_payment_settings")
          .select("monthly_budget_cents,auto_approve_limit_cents")
          .eq("organization_id", organizationId)
          .maybeSingle(),
        db
          .from("agent_payments")
          .select("id,agent,payee,purpose,category,amount_cents,status,approval,over_budget,created_at")
          .eq("organization_id", organizationId)
          .eq("budget_month", month())
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (settings.error || payments.error) throw new Error("Payments could not load. Refresh to try again.");
      return {
        settings: settings.data
          ? {
              monthlyBudgetCents: Number(settings.data.monthly_budget_cents),
              autoApproveLimitCents: Number(settings.data.auto_approve_limit_cents),
            }
          : null,
        payments: (payments.data ?? []) as PaymentRow[],
      };
    },
    async save(settings) {
      const r = await db.rpc("save_payment_settings", {
        workspace: organizationId,
        budget_cents: settings.monthlyBudgetCents,
        auto_limit_cents: settings.autoApproveLimitCents,
      });
      if (r.error) throw new Error(r.error.message);
    },
    async request(input) {
      const r = await db.rpc("request_agent_payment", {
        workspace: organizationId,
        helper: "main",
        payee_name: input.payee,
        payment_purpose: input.purpose,
        payment_category: input.category,
        cents: input.cents,
      });
      if (r.error) throw new Error(r.error.message);
    },
    async review(id, decision) {
      const r = await db.rpc("review_agent_payment", { target: id, decision });
      if (r.error) throw new Error(r.error.message);
    },
  };
}

export function PaymentSettings({
  backend,
  admin,
  editor,
}: {
  backend: Backend;
  admin: boolean;
  editor: boolean;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [budget, setBudget] = useState("");
  const [limit, setLimit] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ payee: "", purpose: "", category: "vendor" as PaymentCategory, amount: "" });

  const refresh = useCallback(async () => {
    try {
      const data = await backend.load();
      setSettings(data.settings);
      setPayments(data.payments);
      if (data.settings) {
        setBudget(String(data.settings.monthlyBudgetCents / 100));
        setLimit(String(data.settings.autoApproveLimitCents / 100));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Payments could not load.");
    }
  }, [backend]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(work: () => Promise<void>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      await refresh();
      setNotice(success);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong. Nothing was paid.");
    } finally {
      setBusy(false);
    }
  }

  const committed = payments
    .filter((p) => p.status === "approved" || p.status === "paid")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const waiting = payments.filter((p) => p.status === "needs_approval");
  const percent = settings?.monthlyBudgetCents
    ? Math.min(100, Math.round((committed / settings.monthlyBudgetCents) * 100))
    : 0;

  return (
    <div className="space-y-5">
      {notice && (
        <p role="status" className="rounded-xl bg-muted px-4 py-2.5 text-[13px]">
          {notice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="cv-card" aria-label="Monthly budget">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="!m-0 text-[15px]">This month</h3>
            <small className="text-muted-foreground">
              {settings ? `${formatMoney(committed)} of ${formatMoney(settings.monthlyBudgetCents)}` : "No budget yet"}
            </small>
          </div>
          <div className="cv-meter mt-3" aria-hidden="true">
            <i style={{ width: `${percent}%` }} />
          </div>
          <p className="!mb-4 mt-3 text-[13px] text-muted-foreground">
            Civi and its helpers pay vendors, venues, ad boosts and platform fees from this budget.
            Payments up to your automatic limit go through on their own; anything larger, or over
            budget, waits for an administrator.
          </p>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              let next: Settings;
              try {
                next = {
                  monthlyBudgetCents: dollarsToCents(budget || "0"),
                  autoApproveLimitCents: dollarsToCents(limit || "0"),
                };
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "Check the amounts.");
                return;
              }
              const problem = validateSettings(next);
              if (problem) return setNotice(problem);
              void act(() => backend.save(next), "Budget saved.");
            }}
          >
            <label className="cv-field">
              Monthly budget
              <input
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="1500"
                disabled={!admin}
                aria-label="Monthly budget in dollars"
              />
            </label>
            <label className="cv-field">
              Approve automatically up to
              <input
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="100"
                disabled={!admin}
                aria-label="Automatic approval limit in dollars"
              />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="cv-btn" disabled={!admin || busy}>
                Save budget
              </button>
              {!admin && (
                <small className="ml-3 text-muted-foreground">Only administrators change the budget.</small>
              )}
            </div>
          </form>
        </section>

        <section className="cv-card" aria-label="Payment account">
          <h3 className="!m-0 text-[15px]">Payment account</h3>
          <p className="!mb-4 mt-1 text-[13px] text-muted-foreground">
            Money only moves from your organization’s own account. Until one is connected, approved
            payments wait here, marked “not paid yet”.
          </p>
          {[
            { id: "stripe", name: "Stripe", text: "Card payments and payouts to vendors", Icon: CreditCard },
            { id: "plaid", name: "Plaid", text: "Bank transfers from your organization’s account", Icon: Landmark },
          ].map(({ id, name, text }) => (
            <div key={id} className="flex items-center gap-3 border-t border-border py-3 first-of-type:border-t-0">
              <BrandLogo id={id} size={34} />
              <span className="min-w-0 flex-1">
                <b className="block text-[13.5px]">{name}</b>
                <small className="block text-[12.5px] text-muted-foreground">{text}</small>
              </span>
              <span className="cv-pill">Not connected</span>
            </div>
          ))}
          <p className="!mb-0 mt-2 flex items-start gap-2 text-[12.5px] text-muted-foreground">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
            Connecting needs your organization’s own Stripe or bank login. CiviMeet never stores card
            numbers or bank passwords.
          </p>
        </section>
      </div>

      <section className="cv-card" aria-label="Payments">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="!m-0 text-[15px]">
            Payments {waiting.length > 0 && <span className="cv-pill cv-pill-warn ml-2">{waiting.length} waiting</span>}
          </h3>
          <small className="text-muted-foreground">This month</small>
        </div>
        <div className="mt-3">
          {payments.length === 0 && (
            <p className="!mb-0 text-[13px] text-muted-foreground">
              No payments yet. Ask Civi in chat, for example “pay the Reid Park deposit of $250”.
            </p>
          )}
          {payments.map((p) => (
            <article key={p.id} className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0">
              <BrandLogo id={p.agent === "main" ? "civi" : p.agent} size={30} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px]">
                  {p.payee} · {formatMoney(p.amount_cents)}
                </b>
                <small className="block truncate text-[12.5px] text-muted-foreground">
                  {categoryLabels[p.category]} · {p.purpose}
                  {p.approval === "auto" ? " · approved automatically" : ""}
                  {p.over_budget ? " · over monthly budget" : ""}
                </small>
              </span>
              {p.status === "needs_approval" ? (
                <span className="flex gap-2">
                  <button
                    className="cv-btn"
                    disabled={!admin || busy}
                    onClick={() =>
                      void act(
                        () => backend.review(p.id, "approve"),
                        "Payment approved. It isn’t paid until your payment account is connected and confirms it.",
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="cv-btn cv-btn-ghost"
                    disabled={!admin || busy}
                    onClick={() => void act(() => backend.review(p.id, "reject"), "Payment declined.")}
                  >
                    Decline
                  </button>
                </span>
              ) : (
                <span className={`cv-pill ${p.status === "paid" ? "cv-pill-ok" : p.status === "approved" ? "cv-pill-warn" : ""}`}>
                  {statusLabels[p.status] ?? p.status}
                </span>
              )}
            </article>
          ))}
        </div>
        {editor && (
          <details className="mt-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-[13px] font-medium">Request a payment yourself</summary>
            <form
              className="mt-3 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                let cents: number;
                try {
                  cents = dollarsToCents(form.amount);
                } catch (error) {
                  return setNotice(error instanceof Error ? error.message : "Check the amount.");
                }
                if (cents < 1) return setNotice("Enter an amount above $0.");
                void act(async () => {
                  await backend.request({ payee: form.payee, purpose: form.purpose, category: form.category, cents });
                  setForm({ payee: "", purpose: "", category: "vendor", amount: "" });
                }, "Payment requested.");
              }}
            >
              <label className="cv-field">
                Pay to
                <input required minLength={2} maxLength={200} value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
              </label>
              <label className="cv-field">
                Amount (USD)
                <input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </label>
              <label className="cv-field">
                Kind
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PaymentCategory })}>
                  {paymentCategories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cv-field">
                What it’s for
                <input required minLength={3} maxLength={1000} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="cv-btn" disabled={busy}>
                  Request payment
                </button>
              </div>
            </form>
          </details>
        )}
      </section>
    </div>
  );
}
