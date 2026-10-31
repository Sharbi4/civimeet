import { describe, expect, it } from "vitest";
import { parseAnalyticsReport, readAnalysisStream } from "@/lib/analytics-report";

describe("Analytics report imports", () => {
  it("reads GA comment headers, quoted channel names and metric values", () => {
    const report = parseAnalyticsReport("traffic.csv", '# Traffic acquisition\nSession channel,Sessions,Key events\n"Organic Search",120,8\n"Direct, unattributed",40,1');
    expect(report.rows).toBe(2);
    expect(JSON.parse(report.normalized).rows[1]).toEqual(["Direct, unattributed", "40", "1"]);
  });
  it("rejects unsupported files and exports without data", () => {
    expect(() => parseAnalyticsReport("traffic.exe", "a,b\n1,2")).toThrow("CSV or JSON");
    expect(() => parseAnalyticsReport("traffic.csv", "a,b")).toThrow("at least one data row");
    expect(() => parseAnalyticsReport("traffic.json", "{}")).toThrow("no data");
  });
  it("handles reasoning and text arriving in separately split stream frames", async () => {
    const events: unknown[] = [];
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({ start(controller) {
      for (const chunk of ['{"type":"reason', 'ing","text":"Checking rows"}\n{"type":"text","text":"Search sessions: 120"}\n', '{"type":"done"}\n']) controller.enqueue(encoder.encode(chunk));
      controller.close();
    } }));
    await readAnalysisStream(response, (event) => events.push(event));
    expect(events).toEqual([{ type: "reasoning", text: "Checking rows" }, { type: "text", text: "Search sessions: 120" }, { type: "done" }]);
  });
  it("does not treat an interrupted stream as complete", async () => {
    await expect(readAnalysisStream(new Response('{"type":"text","text":"Partial"}\n'), () => {})).rejects.toThrow("interrupted");
  });
});