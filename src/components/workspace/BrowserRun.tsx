import { Eye, Hand, Pause, Play, ShieldAlert, Square } from "lucide-react";
import { safetyCheckText } from "@/lib/browser-agent-policy";
import { BrandLogo } from "./BrandLogo";
import type { AgentRun } from "./ChatActions";

const statusCopy: Record<AgentRun["status"], [string, string, string]> = {
  running: ["Working", "bg-blue-50 text-blue-700", "bg-blue-500 animate-pulse"],
  waiting_for_human: ["Waiting for you", "bg-amber-50 text-amber-800", "bg-amber-500"],
  paused: ["Paused", "bg-slate-100 text-slate-600", "bg-slate-400"],
  succeeded: ["Done", "bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  failed: ["Didn’t finish", "bg-red-50 text-red-700", "bg-red-500"],
  cancelled: ["Stopped", "bg-slate-100 text-slate-500", "bg-slate-300"],
};
const eventTone: Record<string, string> = {
  blocked: "bg-amber-500",
  safety_check: "bg-amber-500",
  human: "bg-blue-400",
  error: "bg-red-500",
  result: "bg-emerald-500",
};

/** A computer-use run as it happens: real screenshots, actions and outcomes. */
export function BrowserRun({
  run,
  busy,
  onControl,
}: {
  run: AgentRun;
  busy: string | null;
  onControl: (
    command:
      "pause" | "resume" | "stop" | "takeover" | "release" | "approve_safety" | "decline_safety",
  ) => void;
}) {
  const [label, tone, dot] = statusCopy[run.status];
  const live = ["running", "waiting_for_human", "paused"].includes(run.status);
  const button =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-50";
  return (
    <section aria-label={`${run.name} agent browser run`} className="space-y-3">
      <div className="flex items-start gap-3">
        <BrandLogo id={run.platform} size={32} />
        <div className="min-w-0 flex-1">
          <p className="!mb-0.5 text-[14px] font-semibold text-[#142d40]">
            {run.name} agent · read-only
          </p>
          <p className="!mb-0 line-clamp-2 text-[12px] text-[#64717a]">{run.objective}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${tone}`}
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </span>
      </div>

      {run.status === "running" && (
        <p className="!mb-0 inline-flex items-center gap-2 text-[13px] text-blue-800" role="status">
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          {run.currentAction || "Looking at the page"}
        </p>
      )}
      {run.detail && run.status !== "succeeded" && (
        <p
          className={`!mb-0 rounded-xl px-3 py-2 text-[13px] ${run.status === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
        >
          {run.detail}
        </p>
      )}

      {run.safetyChecks.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="!mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-amber-900">
            <ShieldAlert size={15} /> Meta wants a person to confirm the next step
          </p>
          <ul className="!mb-2 list-disc pl-5 text-[12px] text-amber-900">
            {run.safetyChecks.map((check) => (
              <li key={check.id}>{safetyCheckText(check)}</li>
            ))}
          </ul>
          {run.proposed.length > 0 && (
            <div className="!mb-2 rounded-lg bg-white/70 px-2.5 py-2">
              <p className="!mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-800">
                The agent wants to
              </p>
              <ul className="!mb-0 space-y-0.5 text-[12px] text-[#142d40]">
                {run.proposed.map((action, index) => (
                  <li key={`${index}-${action.summary}`}>
                    {action.summary}
                    {!action.allowed && (
                      <span className="text-red-700">
                        {" "}
                        · Civi will block this{action.reason ? `: ${action.reason}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="!mb-2 text-[12px] text-amber-800">
            Allowing it still keeps Civi read-only: actions that would post, send or change anything
            stay blocked.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => onControl("approve_safety")}
              className={`${button} bg-[#064cff] text-white hover:bg-[#0640d4]`}
            >
              Allow and continue
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => onControl("decline_safety")}
              className={`${button} text-red-600 hover:bg-red-50`}
            >
              Stop
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#e4e9ec] bg-[#f8fafb]">
        {run.viewer ? (
          <iframe
            title={`${run.name} agent browser, you're in control`}
            src={run.viewer}
            className="block aspect-[16/10] w-full"
            referrerPolicy="no-referrer"
          />
        ) : run.screenshot ? (
          <img
            src={run.screenshot}
            alt={`What the ${run.name} agent sees`}
            className="block w-full"
          />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center text-[13px] text-[#8191a3]">
            {live ? "Opening the browser…" : "No screenshot"}
          </div>
        )}
        {run.url && (
          <p className="!mb-0 truncate border-t border-[#eef2f5] px-3 py-1.5 text-[11px] text-[#64717a]">
            {run.url}
          </p>
        )}
      </div>

      {live && (
        <div className="flex flex-wrap gap-1.5">
          {run.viewer ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => onControl("release")}
              className={`${button} bg-[#064cff] text-white hover:bg-[#0640d4]`}
            >
              <Play size={13} /> Hand back to Civi
            </button>
          ) : (
            <button
              type="button"
              disabled={Boolean(busy) || run.safetyChecks.length > 0}
              onClick={() => onControl("takeover")}
              className={`${button} border border-[#d7e0e5] text-[#142d40] hover:bg-slate-50`}
            >
              <Hand size={13} /> Take control
            </button>
          )}
          {run.status === "running" && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => onControl("pause")}
              className={`${button} text-[#475569] hover:bg-slate-100`}
            >
              <Pause size={13} /> Pause
            </button>
          )}
          {run.status === "paused" && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => onControl("resume")}
              className={`${button} text-[#475569] hover:bg-slate-100`}
            >
              <Play size={13} /> Resume
            </button>
          )}
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => onControl("stop")}
            className={`${button} text-red-600 hover:bg-red-50`}
          >
            <Square size={12} /> Stop
          </button>
        </div>
      )}

      {run.status === "succeeded" && run.result?.summary && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <p className="!mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-emerald-800">
            <Eye size={13} /> What it saw
          </p>
          <p className="!mb-1 whitespace-pre-wrap text-[13px] text-[#1f3b2c]">
            {run.result.summary}
          </p>
          {run.result.url && (
            <p className="!mb-0 truncate text-[11px] text-emerald-800">
              {run.result.title ? `${run.result.title} · ` : ""}
              {run.result.url}
            </p>
          )}
        </div>
      )}

      {run.events.length > 0 && (
        <ol className="space-y-1.5 border-l border-[#e4e9ec] pl-3">
          {run.events.map((event) => (
            <li key={event.id} className="relative text-[12px] text-[#475569]">
              <span
                className={`absolute -left-[17px] top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${eventTone[event.kind] ?? "bg-slate-300"}`}
              />
              {event.summary}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
