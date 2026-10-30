import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ mode: s.mode === "signup" ? ("signup" as const) : undefined }),
  head: () => ({
    meta: [
      { title: "Sign in — CiviMeet" },
      { name: "description", content: "Sign in or create your CiviMeet organization account." },
      { property: "og:title", content: "Sign in to CiviMeet" },
      { property: "og:description", content: "Access your CiviMeet workspace." },
    ],
  }),
  component: Auth,
});

function Auth() {
  const { mode } = Route.useSearch();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-6 text-xl font-semibold">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accounts are being set up in the next build step. Sign-up and sign-in aren't available yet.
        </p>
        <Button asChild variant="outline" className="mt-6"><Link to="/">Back to home</Link></Button>
      </div>
    </div>
  );
}
