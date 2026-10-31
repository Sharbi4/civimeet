import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/workspace/WorkspaceGate", () => ({ useWorkspace: () => ({ role: "owner", organizationId: "11111111-1111-4111-8111-111111111111", db: { auth: { getSession: async () => ({ data: { session: { access_token: "fixture-token" } } }) } } }) }));
import { AnalyticsReports } from "@/components/workspace/AnalyticsReports";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Analytics reports workspace", () => {
  it("stops an active request and clears the waiting state", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError"))));
    }));
    render(<AnalyticsReports />);
    const file = new File(["Channel,Sessions\nSearch,120"], "traffic.csv");
    Object.defineProperty(file, "text", { value: async () => "Channel,Sessions\nSearch,120" });
    fireEvent.change(screen.getByLabelText("Google Analytics report"), { target: { files: [file] } });
    await screen.findByText("traffic.csv");
    fireEvent.click(screen.getByRole("button", { name: "Analyze report" }));
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Stop", exact: true }));
    await screen.findByText("Stopped — partial results preserved");
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Analyze report" })).toBeEnabled();
  });
  it("accepts an upload, runs analysis, and displays the real streamed result", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"type":"text","text":"Organic search drove 120 sessions."}\n{"type":"done"}\n'));
    vi.stubGlobal("fetch", fetch);
    render(<AnalyticsReports />);
    const file = new File(["Channel,Sessions\nSearch,120"], "traffic.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => "Channel,Sessions\nSearch,120" });
    fireEvent.change(screen.getByLabelText("Google Analytics report"), { target: { files: [file] } });
    await screen.findByText("traffic.csv");
    fireEvent.click(screen.getByRole("button", { name: "Analyze report" }));
    await screen.findByText("Organic search drove 120 sessions.");
    expect(fetch).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Analysis complete"));
  });
});