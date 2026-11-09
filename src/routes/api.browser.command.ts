import { createFileRoute } from "@tanstack/react-router";
const retired = () => Response.json({ error: "The legacy browser has been retired. Use the OpenAI organizer in chat.", code: "browser_retired" }, { status: 410 });
export const Route = createFileRoute("/api/browser/command")({ server: { handlers: { GET: retired, POST: retired } } });
