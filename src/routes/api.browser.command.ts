import { createFileRoute } from "@tanstack/react-router";
import { browserRuntimeStatus, handleBrowserCommand } from "@/lib/browser-runtime.server";
export const Route = createFileRoute("/api/browser/command")({
  server: {
    handlers: {
      GET: () => browserRuntimeStatus(),
      POST: ({ request }) => handleBrowserCommand(request),
    },
  },
});
