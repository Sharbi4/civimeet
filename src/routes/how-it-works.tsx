import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { stages } from "@/lib/site-content";

const steps = [
  "Set up your organization profile, goals, and geography.",
  "Choose your channels. Accounts connect only through real authorization.",
  "Configure your Community Steward: voice, FAQs, resources, and what it may and may not do.",
  "Set approval rules. Spending money always needs a person to approve.",
  "Your organizer contributes, connects, and helps plan a real-life gathering.",
];

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works — CiviMeet" },
      { name: "description", content: "Contribute, Connect, Meet Up: how CiviMeet's AI organizer works with your team." },
      { property: "og:title", content: "How CiviMeet Works" },
      { property: "og:description", content: "From online presence to real-world gatherings, with humans approving key actions." },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader eyebrow="How it works" title="Contribute. Connect. Meet Up." intro="Start with meaningful conversations, then plan a real-life gathering around shared interests." />
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {stages.map((s) => (
            <div key={s.name} className="rounded-lg border p-6">
              <h2 className="text-xl font-semibold">{s.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
        <h2 className="mt-14 text-2xl font-semibold">Getting started</h2>
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-4 rounded-lg border p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{i + 1}</span>
              <span className="text-sm">{s}</span>
            </li>
          ))}
        </ol>
        <Button asChild className="mt-8" size="lg">
          <Link to="/auth" search={{ mode: "signup" }}>Launch Your AI Organizer</Link>
        </Button>
      </div>
    </SiteLayout>
  ),
});
