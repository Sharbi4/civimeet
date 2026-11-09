import { createFileRoute } from "@tanstack/react-router";
import { handleManagedOrganizer } from "@/lib/ai/managed-organizer.server";
export const Route = createFileRoute("/api/organizer")({
  server: { handlers: { POST: ({ request }) => handleManagedOrganizer(request) } },
});
