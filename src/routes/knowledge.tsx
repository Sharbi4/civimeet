import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorkspaceGate, useWorkspace } from "@/components/workspace/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publicUrl } from "@/lib/vendors";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Shared Organization Knowledge — CiviMeet" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <WorkspaceGate>
      <OrganizationKnowledge />
    </WorkspaceGate>
  ),
});
type Entry = { id: string; title: string; content: string; source_url: string; updated_at: string };
function OrganizationKnowledge() {
  const { db, organizationId, role } = useWorkspace();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    db.from("organization_knowledge")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data, error: failure }) => {
        if (!alive) return;
        setLoading(false);
        if (failure) setError(failure.message);
        else setEntries((data ?? []) as Entry[]);
      });
    return () => {
      alive = false;
    };
  }, [db, organizationId, refresh]);
  async function save() {
    setError("");
    if (source.trim() && !publicUrl.safeParse(source).success) {
      setError("Use a public HTTP or HTTPS source URL.");
      return;
    }
    setBusy(true);
    const { error: failure } = await db.rpc("save_organization_knowledge", {
      workspace: organizationId,
      entry_title: title.trim(),
      entry_content: content.trim(),
      entry_source: source.trim(),
    });
    setBusy(false);
    if (failure) setError(failure.message);
    else {
      setTitle("");
      setContent("");
      setSource("");
      setRefresh((value) => value + 1);
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Shared organization knowledge</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Policies, useful resources, event lessons, and community facts that all of this
          organization's agents can consult.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {role !== "viewer" && (
        <form
          className="space-y-4 rounded-lg border p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Label htmlFor="knowledge-title">Title</Label>
          <Input
            id="knowledge-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={2}
            maxLength={200}
            required
          />
          <Label htmlFor="knowledge-content">Knowledge to retain</Label>
          <Textarea
            id="knowledge-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            minLength={1}
            maxLength={12000}
            rows={5}
            required
          />
          <Label htmlFor="knowledge-source">Source URL (optional)</Label>
          <Input
            id="knowledge-source"
            type="url"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={2048}
          />
          <Button disabled={busy}>{busy ? "Saving…" : "Save shared knowledge"}</Button>
        </form>
      )}
      {loading ? (
        <p role="status">Loading shared knowledge…</p>
      ) : !entries.length ? (
        <p className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
          No shared knowledge has been saved yet.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Latest 100 entries</p>
          {entries.map((entry) => (
            <article key={entry.id} className="space-y-3 rounded-lg border p-5">
              <h3 className="font-semibold">{entry.title}</h3>
              <p className="whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
              {entry.source_url && (
                <a
                  className="break-all text-sm text-primary underline"
                  href={entry.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.source_url}
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Saved {new Date(entry.updated_at).toLocaleString()}
              </p>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
