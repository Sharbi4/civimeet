import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "./GoogleSignInButton";

/** Turns provider errors into plain words a member can act on. */
export function friendlyAuthError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "That email and password don’t match. Try again or reset your password.";
  if (text.includes("email not confirmed")) return "Please confirm your email first — check your inbox for the link.";
  if (text.includes("signup") || text.includes("sign up") || text.includes("not allowed"))
    return "This account isn’t a CiviMeet member yet. Sign in with the email your organization uses, or request access.";
  if (text.includes("rate limit") || text.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  return message;
}

/** Members-only sign-in: email and password, Continue with Google, and password reset. */
export function SignInForm({ db }: { db: SupabaseClient }) {
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        const { error: failure } = await db.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (failure) throw failure;
        setNotice("If that email belongs to a member, a reset link is on its way. Check your inbox.");
      } else {
        const { error: failure } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (failure) throw failure;
      }
    } catch (failure) {
      setError(friendlyAuthError(failure instanceof Error ? failure.message : "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    setNotice("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) {
      setError(friendlyAuthError(result.error.message));
      setBusy(false);
      return;
    }
    if (!result.redirected) setBusy(false);
  }

  return (
    <form
      className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border bg-card p-7 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1.5 text-center">
        <h2 className="text-2xl font-semibold">
          {mode === "forgot" ? "Reset your password" : "Welcome back"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mode === "forgot"
            ? "Enter your email and we’ll send you a link to choose a new password."
            : "Sign in to your CiviMeet organization."}
        </p>
      </div>

      {mode === "sign-in" && (
        <>
          <GoogleSignInButton onClick={() => void google()} disabled={busy} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or sign in with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="workspace-email">Email</Label>
        <Input
          id="workspace-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {mode === "sign-in" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="workspace-password">Password</Label>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode("forgot");
                setError("");
                setNotice("");
              }}
            >
              Forgot password?
            </button>
          </div>
          <Input
            id="workspace-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Sign in"}
      </Button>

      {mode === "forgot" && (
        <button
          type="button"
          className="block w-full text-center text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setMode("sign-in");
            setError("");
            setNotice("");
          }}
        >
          Back to sign in
        </button>
      )}

      {notice && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        New to CiviMeet?{" "}
        <Link to="/get-started" className="text-primary underline-offset-4 hover:underline">
          Request access
        </Link>
      </p>
    </form>
  );
}
