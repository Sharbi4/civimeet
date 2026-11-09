import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/WorkspaceGate", () => ({
  useWorkspace: () => ({
    db: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
    organizationId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  }),
}));
const { ManagedOrganizer } = await import("@/components/workspace/ManagedOrganizer");

type Call = { action: string; message?: string; requestId?: string };
let calls: Call[] = [];
const lines = (...events: unknown[]) =>
  new Response(events.map((event) => JSON.stringify(event) + "\n").join(""), {
    headers: { "Content-Type": "application/x-ndjson" },
  });
/** A live stream that stays open until the request is aborted. */
const openStream = (signal: AbortSignal) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "started" }) + "\n"));
        signal.addEventListener("abort", () =>
          controller.error(new DOMException("aborted", "AbortError")),
        );
      },
    }),
  );
function serve(handler: (call: Call, signal: AbortSignal) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const call = JSON.parse(String(init.body)) as Call;
      calls.push(call);
      return handler(call, init.signal as AbortSignal);
    }),
  );
}
const ready = { configuration: { ready: true }, messages: [] };
beforeEach(() => {
  calls = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("always shows the message box and sends with Enter, even if saved work can't load", async () => {
  serve((call) =>
    call.action === "status"
      ? Response.json({ error: "OpenAI returned HTTP 500" }, { status: 503 })
      : lines(
          { type: "started" },
          { type: "text", id: "a:0", text: "Hi! Happy to help." },
          { type: "outcome", status: "completed" },
        ),
  );
  render(<ManagedOrganizer thread="main" />);
  const box = await screen.findByLabelText("Message your community organizer");
  fireEvent.change(box, { target: { value: "Help us plan a park cleanup" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() =>
    expect(calls.find((call) => call.action === "send")?.message).toBe(
      "Help us plan a park cleanup",
    ),
  );
});

it("lets a new message take over from a stuck task", async () => {
  let statusCalls = 0;
  serve((call, signal) => {
    if (call.action === "status")
      return Response.json(
        statusCalls++ === 0 ? { ...ready, status: "in_progress" } : { ...ready, status: "idle" },
      );
    if (call.action === "resume") return openStream(signal);
    return lines({ type: "started" }, { type: "outcome", status: "completed" });
  });
  render(<ManagedOrganizer thread="main" />);
  // Opening the chat reconnects to the running task on its own.
  await waitFor(() => expect(calls.some((call) => call.action === "resume")).toBe(true));
  const box = screen.getByLabelText("Message your community organizer");
  fireEvent.change(box, { target: { value: "Actually, find venues in Tucson" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() =>
    expect(calls.find((call) => call.action === "send")?.message).toBe(
      "Actually, find venues in Tucson",
    ),
  );
});

it("resends into a fresh conversation when the old one was stuck", async () => {
  let sends = 0;
  serve((call) => {
    if (call.action === "status") return Response.json({ ...ready, status: "idle" });
    sends += 1;
    return sends === 1
      ? Response.json(
          {
            error: "Civi's last task was stuck, so Civi is starting a fresh conversation.",
            restart: true,
          },
          { status: 409 },
        )
      : lines({ type: "started" }, { type: "outcome", status: "completed" });
  });
  render(<ManagedOrganizer thread="main" />);
  const box = await screen.findByLabelText("Message your community organizer");
  fireEvent.change(box, { target: { value: "Hello Civi" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => expect(calls.filter((call) => call.action === "send")).toHaveLength(2));
  const [first, second] = calls.filter((call) => call.action === "send");
  expect(second!.message).toBe("Hello Civi");
  expect(second!.requestId).not.toBe(first!.requestId);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
