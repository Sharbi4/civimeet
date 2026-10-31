import Papa from "papaparse";
import { z } from "zod";

export const analyticsReportSchema = z.object({
  organizationId: z.string().uuid(),
  filename: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(120000),
  goal: z.string().trim().min(3).max(1000),
});

export function parseAnalyticsReport(filename: string, content: string) {
  if (!content.trim()) throw new Error("This report is empty.");
  if (content.length > 120000) throw new Error("Choose a report under 120,000 characters.");
  if (filename.toLowerCase().endsWith(".json")) {
    let data: unknown;
    try { data = JSON.parse(content); } catch { throw new Error("This JSON report is not valid."); }
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) throw new Error("This JSON report has no data.");
    return { format: "JSON", rows: Array.isArray(data) ? data.length : null, normalized: JSON.stringify(data) };
  }
  if (!filename.toLowerCase().endsWith(".csv")) throw new Error("Choose a Google Analytics CSV or JSON export.");
  // GA exports commonly begin with comment lines describing the report and dates.
  const result = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), { comments: "#", skipEmptyLines: "greedy" });
  if (result.errors.some((error) => error.code === "MissingQuotes")) throw new Error("This CSV has an unclosed quoted field.");
  const header = result.data[0];
  if (!header || header.length < 2 || result.data.length < 2) throw new Error("The CSV needs column headings and at least one data row.");
  return { format: "CSV", rows: result.data.length - 1, normalized: JSON.stringify({ columns: header, rows: result.data.slice(1) }) };
}

export type AnalysisEvent = { type: "text" | "reasoning" | "error" | "done"; text?: string };

export async function readAnalysisStream(response: Response, onEvent: (event: AnalysisEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The analysis stream did not start.");
  let buffer = "";
  let completed = false;
  const decoder = new TextDecoder();
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AnalysisEvent;
    if (event.type === "done" || event.type === "error") completed = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf("\n");
      while (end >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); end = buffer.indexOf("\n"); }
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!completed) throw new Error("Analysis was interrupted. Any partial results remain below.");
  } finally { reader.releaseLock(); }
}