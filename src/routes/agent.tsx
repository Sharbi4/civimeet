import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Loader2, ExternalLink } from "lucide-react";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  researchInputSchema,
  type ResearchInput,
  type ResearchResult,
  type ResearchStatus,
} from "@/lib/research";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Community Steward Research — CiviMeet" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentResearch,
});

function AgentResearch() {
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [question, setQuestion] = useState("");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState<ResearchInput["purpose"]>("resources");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent/research", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setStatus(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatusError("Could not check the research service. Reload to try again.");
      });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const input = researchInputSchema.safeParse({ question, location, purpose });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Check the research details.");
      return;
    }
    if (!accessToken.trim()) {
      setError("Enter your private research access token.");
      return;
    }
    setBusy(true);
    setResult(null);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const response = await fetch("/api/agent/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify(input.data),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Research failed. Try again.");
      setResult(payload);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Research failed. Try again.");
    } finally {
      activeRequest.current = null;
      setBusy(false);
    }
  }

  const ready = status?.configured && status.accessConfigured;
  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Community Steward · Private preview"
        title="Research that helps your community"
        intro="Find useful local resources, compare venues and vendors, and explore gathering ideas with Perplexity."
      />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="research-heading" className="rounded-lg border bg-card p-6">
          <h2 id="research-heading" className="text-lg font-semibold">
            Give the steward a research question
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each submission makes a paid API request. Only the question, purpose, and location are
            sent to Perplexity. Use public information.
          </p>
          <div role="status" className="my-5 rounded-md border bg-muted p-3 text-sm">
            {statusError ||
              (!status
                ? "Checking server configuration…"
                : ready
                  ? "Server configured · Connection verified when research succeeds"
                  : "Setup required · Add the Perplexity API key and private research access token to the server secrets.")}
          </div>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="research-token">Private research access token</Label>
              <Input
                id="research-token"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                autoComplete="off"
                maxLength={256}
                required
                disabled={busy}
                aria-describedby="token-help"
              />
              <p id="token-help" className="text-xs text-muted-foreground">
                Use the operator token configured by your administrator. This is separate from your
                Perplexity API key and is held only while this page is open.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="research-purpose">Research purpose</Label>
              <select
                id="research-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as ResearchInput["purpose"])}
                disabled={busy}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="resources">Community resources</option>
                <option value="venues">Venues</option>
                <option value="vendors">Vendors</option>
                <option value="events">Gathering ideas</option>
                <option value="general">General research</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="research-location">Location (optional)</Label>
              <Input
                id="research-location"
                placeholder="City, state, or neighborhood"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={160}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="research-question">What would you like to find out?</Label>
              <Textarea
                id="research-question"
                placeholder="Find accessible meeting spaces for a free neighborhood resource gathering, with official contact links and published fees."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                minLength={10}
                maxLength={3000}
                rows={5}
                required
                disabled={busy}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!ready || busy} className="w-full">
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {busy ? "Researching…" : "Research with Perplexity"}
            </Button>
          </form>
        </section>
        <section
          aria-labelledby="brief-heading"
          aria-busy={busy}
          className="rounded-lg border bg-card p-6"
        >
          <h2 id="brief-heading" className="text-lg font-semibold">
            Research brief
          </h2>
          {busy && (
            <p role="status" className="mt-6 text-sm text-muted-foreground">
              The steward is researching your question. This may take up to 90 seconds.
            </p>
          )}
          {!result && !busy && (
            <p className="mt-6 text-sm text-muted-foreground">
              Your answer, sources, and provider-reported usage will appear here after successful
              research. Results stay on this page; community memory and task storage are still to be
              built.
            </p>
          )}
          {result && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Perplexity · {result.model} · {new Date(result.researchedAt).toLocaleString()}
              </p>
              <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7">
                {result.answer}
              </div>
              <h3 className="mt-8 font-semibold">Sources</h3>
              {result.sources.length ? (
                <ul className="mt-3 space-y-3">
                  {result.sources.map((source) => (
                    <li key={source.id} className="text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-baseline gap-2 text-primary underline underline-offset-4"
                      >
                        [{source.id}] {source.title}
                        <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No source links were returned. Verify this answer independently before using it.
                </p>
              )}
              <p className="mt-6 text-xs text-muted-foreground">
                Input tokens: {result.usage.inputTokens ?? "Not reported"} · Output tokens:{" "}
                {result.usage.outputTokens ?? "Not reported"} · API cost:{" "}
                {result.usage.costUsd === null
                  ? "Not reported"
                  : `$${result.usage.costUsd.toFixed(4)}`}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Research can contain errors. Confirm availability, pricing, and accessibility with
                the source before making plans.
              </p>
            </>
          )}
        </section>
      </div>
    </SiteLayout>
  );
}
