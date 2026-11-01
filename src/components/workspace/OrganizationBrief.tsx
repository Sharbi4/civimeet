import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "./WorkspaceGate";

type Brief = {
  coordinator: string;
  area: string;
  mission: string;
  voice: string;
  event_goal: string;
  platform_actions: Record<string, string>;
};
const channels = {
  web: "Public web",
  x: "X",
  eventbrite: "Eventbrite",
  facebook: "Facebook",
  reddit: "Reddit",
  nextdoor: "Nextdoor",
  instagram: "Instagram",
};
const empty: Brief = {
  coordinator: "",
  area: "",
  mission: "",
  voice: "Warm, helpful, clear, and transparent about representing our organization.",
  event_goal: "",
  platform_actions: { web: "Find useful local resources and potential event vendors." },
};
export function OrganizationBrief({
  next,
  onNext,
}: {
  next: "research" | "review" | "followup";
  onNext: () => void;
}) {
  const { db, organizationId, role } = useWorkspace();
  const admin = ["owner", "admin"].includes(role);
  const [saved, setSaved] = useState<Brief | null>(null);
  const [draft, setDraft] = useState<Brief>(empty);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    db.from("organization_briefs")
      .select("coordinator,area,mission,voice,event_goal,platform_actions")
      .eq("organization_id", organizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError("Your community brief could not be loaded. Refresh to try again.");
        else if (data) {
          setSaved(data as Brief);
          setDraft(data as Brief);
        } else setEditing(admin);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [db, organizationId, admin]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await db.rpc("save_organization_brief", {
        workspace: organizationId,
        brief: draft,
      });
      if (result.error)
        throw new Error("We could not save your brief. Check the fields and try again.");
      setSaved(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your brief.");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: keyof Omit<Brief, "platform_actions">,
    label: string,
    max: number,
    multiline = false,
    required = true,
  ) => (
    <label className="block space-y-2 text-sm" key={key}>
      <span>{label}</span>
      {multiline ? (
        <Textarea
          required={required}
          minLength={key === "mission" ? 10 : undefined}
          maxLength={max}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <Input
          required={required}
          maxLength={max}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <section className="rounded-2xl border bg-card p-6 space-y-4" aria-label="Your community brief">
      {loading ? (
        <p role="status">Loading your community context…</p>
      ) : editing ? (
        <>
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {
                [
                  "Tell us about your community",
                  "Choose your community channels",
                  "Give your agent direction",
                ][step]
              }
            </h2>
            <span className="text-sm text-muted-foreground">
              {["Your community", "Your channels", "Your agent"][step]}
            </span>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) setStep(step + 1);
              else void save();
            }}
          >
            {step === 0 && (
              <>
                {field("coordinator", "Who is coordinating this community?", 160)}
                {field(
                  "area",
                  "Which city, neighborhoods, and service area should your agent focus on?",
                  200,
                )}
                {field(
                  "mission",
                  "Who do you serve, what brings them together, and what is your mission?",
                  2000,
                  true,
                )}
                <p className="text-sm text-muted-foreground">
                  Include your audience, local priorities, and whether you are starting a new
                  community or growing an existing one. These details guide your agent's research
                  and contributions.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Choose where you already participate and what you want help with. Connecting
                  accounts is a separate step.
                </p>
                {Object.entries(channels).map(([key, label]) => (
                  <div key={key} className="rounded-lg border p-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={key in draft.platform_actions}
                        disabled={key === "web"}
                        onChange={(e) => {
                          const actions = { ...draft.platform_actions };
                          if (e.target.checked)
                            actions[key] =
                              "Find mission-aligned local communities and prepare helpful, specific contributions for review. Listen and offer value before inviting people to our events.";
                          else delete actions[key];
                          setDraft({ ...draft, platform_actions: actions });
                        }}
                      />
                      {label}
                    </label>
                    {key in draft.platform_actions && (
                      <Input
                        aria-label={`${label} responsibilities`}
                        required
                        minLength={3}
                        maxLength={1000}
                        value={draft.platform_actions[key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            platform_actions: { ...draft.platform_actions, [key]: e.target.value },
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </>
            )}
            {step === 2 && (
              <>
                {field(
                  "voice",
                  "How should your agent sound, help people, and represent your organization?",
                  500,
                  true,
                )}
                {field(
                  "event_goal",
                  "What would you like to bring people together for?",
                  1000,
                  true,
                  false,
                )}
                <p className="text-xs text-muted-foreground">
                  Your brief guides planning and research. Sending messages, publishing, booking,
                  and paying still require the appropriate connection and approval. Do not include
                  passwords here.
                </p>
              </>
            )}
            <div className="flex gap-3">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              <Button disabled={busy}>
                {busy ? "Saving…" : step === 2 ? "Save my community brief" : "Continue"}
              </Button>
              {saved && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setDraft(saved);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </>
      ) : saved ? (
        <>
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-xs text-primary">Working with your community context</p>
              <h2 className="text-xl font-semibold">{saved.area}</h2>
            </div>
            {admin && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(0);
                  setEditing(true);
                }}
              >
                Edit brief
              </Button>
            )}
          </div>
          <p className="text-sm">{saved.mission}</p>
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <h3 className="font-medium">
              {next === "review"
                ? "Your next step: review a proposed plan"
                : next === "followup"
                  ? "Your next step: follow through on a commitment"
                  : "Your next step: discover something useful"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {next === "research"
                ? `Start with local resources${saved.event_goal ? " for: " + saved.event_goal : " that support your mission"}. Your brief will guide the research.`
                : "Review the latest situation, choose the next action, and record what happens."}
            </p>
            <Button onClick={onNext}>
              {next === "research"
                ? "Explore local opportunities"
                : next === "review"
                  ? "Review plans"
                  : "See follow-ups"}
            </Button>
          </div>
          {Object.keys(saved.platform_actions).some((key) => key !== "web") && (
            <p className="text-sm">
              <Link to="/platform-agents" className="text-primary underline">
                Review your selected channels
              </Link>{" "}
              · Selecting a platform does not connect an account.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm">
          An organization administrator can add your community's mission, area, and agent
          preferences here.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
