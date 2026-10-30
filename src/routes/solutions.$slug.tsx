import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { solutions } from "@/lib/site-content";

export const Route = createFileRoute("/solutions/$slug")({
  loader: ({ params }) => {
    const s = solutions.find((x) => x.slug === params.slug);
    if (!s) throw notFound();
    return s;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `CiviMeet for ${loaderData.name}` },
          { name: "description", content: loaderData.summary },
          { property: "og:title", content: `CiviMeet for ${loaderData.name}` },
          { property: "og:description", content: loaderData.summary },
        ]
      : [{ title: "Unavailable — CiviMeet" }, { name: "robots", content: "noindex" }],
  }),
  component: Solution,
});

function Solution() {
  const s = Route.useLoaderData();
  return (
    <SiteLayout>
      <PageHeader eyebrow="Solutions" title={`CiviMeet for ${s.name}`} intro={s.summary} />
      <div className="mx-auto max-w-6xl px-4 py-14">
        <ul className="space-y-3">
          {s.points.map((p) => (
            <li key={p} className="rounded-lg border p-4 text-sm">{p}</li>
          ))}
        </ul>
        <div className="mt-8 flex gap-3">
          <Button asChild><Link to="/auth" search={{ mode: "signup" }}>Get Started</Link></Button>
          <Button asChild variant="outline"><Link to="/solutions">All solutions</Link></Button>
        </div>
      </div>
    </SiteLayout>
  );
}
