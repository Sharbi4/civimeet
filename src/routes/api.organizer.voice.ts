import { createFileRoute } from "@tanstack/react-router";
import { handleOrganizerVoice } from "@/lib/organizer-voice.server";

export const Route = createFileRoute("/api/organizer/voice")({
  server: { handlers: { POST: ({ request }) => handleOrganizerVoice(request) } },
});