import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  oauth: vi.fn().mockResolvedValue({ redirected: true }),
}));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { SignInForm, friendlyAuthError } from "@/components/auth/SignInForm";
import { newPasswordProblem } from "@/lib/auth-rules";

function fakeDb() {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn(),
  };
  return { auth, db: { auth } as unknown as SupabaseClient };
}
afterEach(cleanup);

describe("member sign-in", () => {
  it("offers email/password and Google only — no Lovable login and no account creation", () => {
    render(<SignInForm db={fakeDb().db} />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lovable/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create an account/ })).not.toBeInTheDocument();
  });

  it("signs in with email and password", async () => {
    const { db, auth } = fakeDb();
    render(<SignInForm db={db} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " member@example.org " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "member@example.org", password: "secret-pass" }),
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("starts Google sign-in returning to the public sign-in page", async () => {
    render(<SignInForm db={fakeDb().db} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() =>
      expect(mocks.oauth).toHaveBeenCalledWith("google", { redirect_uri: `${window.location.origin}/auth` }),
    );
  });

  it("sends password reset links to the reset page", async () => {
    const { db, auth } = fakeDb();
    render(<SignInForm db={db} />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "member@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("member@example.org", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
  });

  it("explains that non-members can't sign in yet", () => {
    expect(friendlyAuthError("Signups not allowed for this instance")).toMatch(/isn’t a CiviMeet member/);
  });

  it("requires new passwords of 8+ characters that match", () => {
    expect(newPasswordProblem("short", "short")).toBe("Use at least 8 characters.");
    expect(newPasswordProblem("long-enough", "different1")).toBe("The two passwords don’t match.");
    expect(newPasswordProblem("long-enough", "long-enough")).toBeNull();
  });
});
