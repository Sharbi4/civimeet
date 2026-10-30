import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { solutions } from "@/lib/site-content";

export const Route = createFileRoute("/solutions/")({
  head: () => ({
    meta: [
      { title: "Solutions — CiviMeet" },
      { name: "description", content: "CiviMeet for nonprofits, civic groups, municipalities, neighborhoods, and membership organizations." },
      { property: "og:title", content: "CiviMeet Solutions" },
      { property: "og:description", content: "AI community organizing for every kind of community institution." },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader eyebrow="Solutions" title="Built for community institutions" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {solutions.map((s) => (
          <Link key={s.slug} to="/solutions/$slug" params={{ slug: s.slug }} className="rounded-lg border p-6 hover:border-primary">
            <h2 className="font-semibold">{s.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{s.summary}</p>
            <span className="mt-4 inline-block text-sm font-medium text-primary">Learn more →</span>
          </Link>
        ))}
      </div>
    </SiteLayout>
  ),
});
