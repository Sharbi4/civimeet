import { createFileRoute } from "@tanstack/react-router";
import { handleConnectorOAuthCallback } from "@/lib/connector-runtime.server";
export const Route = createFileRoute("/api/connectors/oauth/callback")({
  server: {
    handlers: {
      GET: ({ request }) => handleConnectorOAuthCallback(request),
    },
  },
});
