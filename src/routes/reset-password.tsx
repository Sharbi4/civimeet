import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDatabase } from "@/lib/database";
import { newPasswordProblem } from "@/lib/auth-rules";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — CiviMeet" },
      { name: "description", content: "Set a new password for your CiviMeet member account." },
      { property: "og:title", content: "Choose a new password — CiviMeet" },
      { property: "og:description", content: "Set a new password for your CiviMeet member account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [db, setDb] = useState<SupabaseClient | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const database = getDatabase();
    setDb(database);
    if (!database) {
      setState("expired");
      return;
    }
    const { data } = database.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setState("ready");
    });
    // The reset link signs the member in briefly; give it a moment to arrive.
    const timer = setTimeout(async () => {
      const { data: current } = await database.auth.getSession();
      setState((prev) => (prev === "ready" || current.session ? "ready" : "expired"));
    }, 1500);
    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function save() {
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    if (!db) return;
    setBusy(true);
    setError("");
    const { error: failure } = await db.auth.updateUser({ password });
    setBusy(false);
    if (failure) return setError(failure.message);
    void navigate({ to: "/dashboard", replace: true });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-16">
        {state === "checking" ? (
          <p role="status" className="text-center">Checking your reset link…</p>
        ) : state === "expired" ? (
          <div className="mx-auto max-w-sm space-y-4 rounded-2xl border bg-card p-7 text-center shadow-sm">
            <h1 className="text-2xl font-semibold">This link has expired</h1>
            <p className="text-sm text-muted-foreground">
              Reset links work once and only for a short time. Request a new one from the sign-in page.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            className="mx-auto max-w-sm space-y-5 rounded-2xl border bg-card p-7 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5 text-center">
              <h1 className="text-2xl font-semibold">Choose a new password</h1>
              <p className="text-sm text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save password and sign in"}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </SiteLayout>
  );
}
