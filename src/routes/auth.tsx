import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — CiviMeet" }] }),
  component: Auth,
});
function Auth() {
  return (
    <WorkspaceGate>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your organization workspace is ready</h2>
        <p className="text-muted-foreground">
          Review community needs, plan useful contributions, and build lasting organizational
          knowledge.
        </p>
        <Button asChild>
          <Link to="/dashboard">Open community dashboard</Link>
        </Button>
      </div>
    </WorkspaceGate>
  );
}
