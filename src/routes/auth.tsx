import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CiviMeet" },
      {
        name: "description",
        content: "Members sign in to their CiviMeet organization with email and password or Google.",
      },
      { property: "og:title", content: "Sign in — CiviMeet" },
      {
        property: "og:description",
        content: "Members sign in to their CiviMeet organization with email and password or Google.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Auth,
});

function Auth() {
  return (
    <WorkspaceGate>
      <OpenDashboard />
    </WorkspaceGate>
  );
}

/** Once a member is signed in with a workspace, take them straight to Civi. */
function OpenDashboard() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/dashboard", replace: true });
  }, [navigate]);
  return <p role="status">Opening your workspace…</p>;
}
