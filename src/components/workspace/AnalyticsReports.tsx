import { useEffect, useRef, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Loader2, Square, Upload, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkspace } from "./WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseAnalyticsReport, readAnalysisStream } from "@/lib/analytics-report";

type Report = { filename: string; content: string; rows: number | null; format: string };

export function AnalyticsReports() {
  const { db, organizationId, role } = useWorkspace();
  const [report, setReport] = useState<Report | null>(null);
  const [goal, setGoal] = useState("Increase completed demo requests from qualified community organizations.");
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const editor = ["owner", "admin", "organizer"].includes(role);
  useEffect(() => () => controller.current?.abort(), []);

  async function selectFile(file?: File) {
    if (!file) return;
    setError(""); setAnswer(""); setReasoning(""); setStatus(""); setReport(null);
    try {
      if (file.size > 500000) throw new Error("Choose a CSV or JSON report smaller than 500 KB.");
      const content = await file.text();
      const parsed = parseAnalyticsReport(file.name, content);
      setReport({ filename: file.name, content, rows: parsed.rows, format: parsed.format });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not read this report."); }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function analyze() {
    if (!report || !editor || busy) return;
    setBusy(true); setError(""); setAnswer(""); setReasoning(""); setStatus("Analyzing report…");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const { data, error: sessionError } = await db.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in again to analyze reports.");
      const response = await fetch("/api/analytics/analyze", {
        method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ organizationId, filename: report.filename, content: report.content, goal }),
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error ?? `Analysis could not start (${response.status}).`);
      }
      await readAnalysisStream(response, (event) => {
        if (event.type === "text") { setAnswer((value) => value + (event.text ?? "")); setStatus("Writing recommendations…"); }
        if (event.type === "reasoning") setReasoning((value) => value + (event.text ?? ""));
        if (event.type === "error") { setError(event.text ?? "Analysis could not complete."); setStatus(""); }
        if (event.type === "done") setStatus("Analysis complete");
      });
    } catch (failure) {
      if (abort.signal.aborted) setStatus("Stopped — partial results preserved");
      else { setError(failure instanceof Error ? failure.message : "Analysis could not complete."); setStatus(""); }
    } finally { setBusy(false); controller.current = null; }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([answer], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "civimeet-traffic-analysis.md"; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-7">
      <div className="flex items-start gap-3 border-b pb-6">
        <BarChart3 className="mt-1 size-7 shrink-0 text-primary" />
        <div><p className="text-sm text-primary">Traffic & conversion</p><h2 className="mt-1 text-3xl font-semibold">Analytics reports</h2></div>
      </div>
      <form className="grid gap-6 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void analyze(); }}>
        <div className="space-y-4">
          <Label htmlFor="analytics-report-file">Google Analytics report</Label>
          <Input ref={fileInput} id="analytics-report-file" type="file" accept=".csv,.json" disabled={busy || !editor} onChange={(event) => void selectFile(event.target.files?.[0])} />
          {report ? <div className="flex min-w-0 items-center gap-3 rounded-md border p-4"><FileSpreadsheet className="size-6 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="break-all font-medium">{report.filename}</p><p className="text-sm text-muted-foreground">{report.format}{report.rows !== null ? ` · ${report.rows} data rows` : ""}</p></div><Button type="button" variant="ghost" size="icon" title="Remove report" aria-label="Remove report" disabled={busy} onClick={() => { setReport(null); setAnswer(""); setReasoning(""); setStatus(""); }}><X className="size-4" /></Button></div> : <div className="flex items-center gap-3 border-b py-5 text-muted-foreground"><Upload className="size-6 shrink-0" /><p className="text-sm">CSV or JSON export · Maximum 500 KB / 120,000 characters</p></div>}
          <p className="text-xs leading-relaxed text-muted-foreground">Reports are sent to Lovable AI for this analysis, not saved to your workspace. Remove personal information before uploading. Download results before leaving this page. AI usage consumes workspace credits.</p>
          {!editor && <p className="text-sm text-muted-foreground">An organization editor can run report analysis.</p>}
        </div>
        <div className="space-y-4">
          <Label htmlFor="conversion-goal">Conversion goal</Label>
          <Textarea id="conversion-goal" value={goal} onChange={(event) => setGoal(event.target.value)} minLength={3} maxLength={1000} required disabled={busy || !editor} className="min-h-32" />
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!report || !editor || busy || goal.trim().length < 3}>{busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <BarChart3 className="size-4" />} Analyze report</Button>{busy && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}><Square className="size-4" />Stop</Button>}</div>
        </div>
      </form>
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
      {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
      {reasoning && <details className="border-b pb-4"><summary className="cursor-pointer text-sm text-muted-foreground">Analysis notes</summary><div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{reasoning}</div></details>}
      {answer && <div className="border-t pt-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold">Traffic findings & recommendations</h3><Button variant="outline" size="sm" disabled={busy} onClick={download}><Download className="size-4" />Download analysis</Button></div><div className="max-w-4xl break-words text-sm leading-7 [&_h1]:mb-3 [&_h1]:mt-7 [&_h1]:text-xl [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-xl [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6"><Markdown remarkPlugins={[remarkGfm]} components={{ table: ({ children }) => <div className="my-5 max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm [&_th]:border-b [&_th]:bg-muted [&_th]:p-3 [&_td]:border-b [&_td]:p-3 [&_td]:align-top">{children}</table></div> }}>{answer}</Markdown></div></div>}
    </section>
  );
}