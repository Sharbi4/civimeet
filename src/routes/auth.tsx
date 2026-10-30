import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signup" } =>
    s["mode"] === "signup" ? { mode: "signup" } : {},
  head: () => ({ meta: [{ title: "Sign in — CiviMeet" }] }),
  component: Auth,
});
function Auth() {
  const { mode } = Route.useSearch();
  return (
    <WorkspaceGate initialSignup={mode === "signup"}>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your organization workspace is ready</h2>
        <p className="text-muted-foreground">
          Manage vendor knowledge and the memory of each platform agent.
        </p>
        <Button asChild>
          <Link to="/vendors">Open vendor directory</Link>
        </Button>
      </div>
    </WorkspaceGate>
  );
}
