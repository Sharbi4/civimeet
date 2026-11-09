import { ArrowRight, Inbox, Wallet } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { formatMoney } from "@/lib/event-money";

export type HelperStatus = {
  connector: string;
  name: string;
  status: string;
  detail?: string | undefined;
};

const statusText: Record<string, [string, string]> = {
  connected: ["Working", "cv-pill-ok"],
  needs_attention: ["Needs you", "cv-pill-warn"],
  needs_verification: ["Check sign-in", "cv-pill-warn"],
  saved: ["Checking", ""],
  verifying: ["Checking", ""],
  awaiting_sign_in: ["Waiting for sign-in", "cv-pill-warn"],
};

/** Civi's friendly roll-up of every helper agent, what waits for people, and spending. */
export function HelperReport({
  organization,
  helpers,
  pendingApprovals,
  spend,
  onOpenHelper,
  onOpenSettings,
  onOpenApprovals,
  onOpenPayments,
}: {
  organization: string;
  helpers: HelperStatus[];
  pendingApprovals: number;
  spend: { committedCents: number; budgetCents: number | null; waiting: number } | null;
  onOpenHelper: (connector: string) => void;
  onOpenSettings: () => void;
  onOpenApprovals: () => void;
  onOpenPayments: () => void;
}) {
  const attention = helpers.filter((h) => h.status !== "connected").length;
  const summary = !helpers.length
    ? `No helpers yet. Connect ${organization}'s first account and I'll start a helper for it.`
    : attention
      ? `${helpers.length - attention} of ${helpers.length} helpers are working. ${attention === 1 ? "One needs" : `${attention} need`} a quick look from you.`
      : `All ${helpers.length} helper${helpers.length === 1 ? " is" : "s are"} working. Nice momentum.`;
  return (
    <section className="cv-report" aria-label="Helper report">
      <div className="cv-report-head">
        <span>
          <b>Today’s community check-in</b>
          <small className="block">{summary}</small>
        </span>
        <button type="button" className="cv-chip" onClick={onOpenSettings}>
          Manage
        </button>
      </div>
      {helpers.map((h) => {
        const [label, tone] = statusText[h.status] ?? ["Not connected", ""];
        return (
          <button key={h.connector} type="button" className="cv-report-row" onClick={() => onOpenHelper(h.connector)}>
            <BrandLogo id={h.connector} size={28} />
            <span>
              <b>{h.name} helper</b>
              <small>{h.detail || (h.status === "connected" ? "Connected and ready for today’s work" : "Open to see what it needs")}</small>
            </span>
            <i className={`cv-pill not-italic ${tone}`}>{label}</i>
          </button>
        );
      })}
      {!helpers.length && (
        <button type="button" className="cv-report-row" onClick={onOpenSettings}>
          <span>
            <b>Connect Facebook, Instagram, Threads, Reddit, Eventbrite or LinkedIn</b>
            <small>Each connection gets its own helper that reports back to me.</small>
          </span>
          <ArrowRight size={16} />
        </button>
      )}
      <button type="button" className="cv-report-row" onClick={onOpenApprovals}>
        <Inbox size={18} className="text-muted-foreground" />
        <span>
          <b>{pendingApprovals ? `${pendingApprovals} waiting for your approval` : "Nothing waiting for approval"}</b>
          <small>Posts, messages and bookings go out only after you say yes.</small>
        </span>
        {pendingApprovals > 0 && <i className="cv-pill cv-pill-warn not-italic">Review</i>}
      </button>
      {spend && (
        <button type="button" className="cv-report-row" onClick={onOpenPayments}>
          <Wallet size={18} className="text-muted-foreground" />
          <span>
            <b>
              {spend.budgetCents === null
                ? "No monthly budget set"
                : `${formatMoney(spend.committedCents)} of ${formatMoney(spend.budgetCents)} committed this month`}
            </b>
            <small>
              {spend.waiting ? `${spend.waiting} payment${spend.waiting === 1 ? "" : "s"} waiting for approval` : "Set a budget and an automatic approval limit in Settings."}
            </small>
          </span>
        </button>
      )}
    </section>
  );
}
