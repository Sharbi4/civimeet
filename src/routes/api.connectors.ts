import { createFileRoute } from "@tanstack/react-router";
import { connectorRuntimeStatus, handleConnectorCommand } from "@/lib/connector-runtime.server";
export const Route = createFileRoute("/api/connectors")({
  server: {
    handlers: {
      GET: () => connectorRuntimeStatus(),
      POST: ({ request }) => handleConnectorCommand(request),
    },
  },
});
