import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { features } from "@/lib/site-content";

export const Route = createFileRoute("/product")({
  head: () => ({
    meta: [
      { title: "Product — CiviMeet" },
      { name: "description", content: "Ten capabilities that make CiviMeet an AI community operations system." },
      { property: "og:title", content: "CiviMeet Product" },
      { property: "og:description", content: "AI community steward, memory, vendor and venue research, events, and more." },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader eyebrow="Product" title="An AI organizer that becomes a fixture of your community" intro="Not just event registration or post scheduling. CiviMeet is an ongoing community operations system." />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 md:grid-cols-2">
        {features.map((f, i) => (
          <div key={f.name} className="rounded-lg border p-6">
            <p className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-1 text-lg font-semibold">{f.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </div>
    </SiteLayout>
  ),
});
