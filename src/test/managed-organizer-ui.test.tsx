import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/WorkspaceGate", () => {
  // One stable workspace, like the real app's context.
  const workspace = {
    db: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
    organizationId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  };
  return { useWorkspace: () => workspace };
});
const { ManagedOrganizer } = await import("@/components/workspace/ManagedOrganizer");

type Call = {
  action: string;
  message?: string;
  requestId?: string;
  actionId?: string;
  approve?: boolean;
};
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

it("keeps Civi's browser on screen above the chat, with the last page it opened", async () => {
  serve(() =>
    Response.json({
      ...ready,
      status: "idle",
      messages: [{ id: "m", role: "assistant", text: "Found 3 events" }],
      browser: {
        available: true,
        title: "Reid Park Zoo events",
        screenshot: "data:image/jpeg;base64,BBBB",
      },
    }),
  );
  render(<ManagedOrganizer thread="main" />);
  const panel = await screen.findByRole("region", { name: "Civi's browser" });
  expect(panel).toHaveTextContent("Ready");
  expect(
    await screen.findByAltText(/What Civi's browser shows: Reid Park Zoo events/),
  ).toHaveAttribute("src", "data:image/jpeg;base64,BBBB");
});

it("shows Civi's live browser, watch-only until you take control", async () => {
  let human = false;
  serve((call) => {
    if (call.action === "browser_takeover") {
      human = true;
      return Response.json({ status: "human" });
    }
    if (call.action === "browser_handback") {
      human = false;
      return Response.json({ status: "civi" });
    }
    return Response.json({
      ...ready,
      status: "idle",
      messages: [{ id: "m", role: "assistant", text: "I opened the zoo's calendar." }],
      browser: {
        available: true,
        title: null,
        screenshot: null,
        live: {
          url: "https://www.browserbase.com/devtools-fullscreen/x?navbar=false",
          humanControl: human,
        },
      },
    });
  });
  render(<ManagedOrganizer thread="main" />);
  const frame = await screen.findByTitle("Civi's live browser");
  expect(frame).toHaveAttribute(
    "src",
    "https://www.browserbase.com/devtools-fullscreen/x?navbar=false",
  );
  expect((frame as HTMLIFrameElement).style.pointerEvents).toBe("none");
  fireEvent.click(screen.getByRole("button", { name: "Take control" }));
  await waitFor(() => expect(calls.some((c) => c.action === "browser_takeover")).toBe(true));
  expect(await screen.findByRole("button", { name: "Hand back to Civi" })).toBeInTheDocument();
  expect((screen.getByTitle("Civi's live browser") as HTMLIFrameElement).style.pointerEvents).toBe(
    "auto",
  );
  fireEvent.click(screen.getByRole("button", { name: "Hand back to Civi" }));
  await waitFor(() => expect(calls.some((c) => c.action === "browser_handback")).toBe(true));
  expect(await screen.findByRole("button", { name: "Take control" })).toBeInTheDocument();
});

it("shows what Civi wants to do and acts only on Approve", async () => {
  const decisions: Call[] = [];
  serve((call) => {
    if (call.action === "browser_decide") {
      decisions.push(call);
      return Response.json({ status: "approved" });
    }
    return Response.json({
      ...ready,
      status: "in_progress",
      messages: [{ id: "u", role: "user", text: "Comment on the pantry post" }],
      browser: {
        available: true,
        title: null,
        screenshot: null,
        live: null,
        approvals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            description: "Comment on the pantry post in Tucson Parents",
            site: "www.facebook.com",
            text: "Our mobile pantry is open Saturday 9–12.",
          },
        ],
      },
    });
  });
  render(<ManagedOrganizer thread="main" />);
  const card = await screen.findByRole("region", { name: "Civi asks for approval" });
  expect(card).toHaveTextContent("Comment on the pantry post in Tucson Parents");
  expect(card).toHaveTextContent("www.facebook.com");
  expect(card).toHaveTextContent("Our mobile pantry is open Saturday 9–12.");
  fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(decisions[0]).toMatchObject({
      action: "browser_decide",
      actionId: "33333333-3333-4333-8333-333333333333",
      approve: true,
    }),
  );
});
