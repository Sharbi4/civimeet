import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { features, plans, solutions, stages } from "@/lib/site-content";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CiviMeet — AI community organizers for real-world gatherings" },
      { name: "description", content: "CiviMeet uses AI community organizers to help organizations stay connected with their communities and coordinate real-world gatherings." },
      { property: "og:title", content: "CiviMeet — Build communities. Bring people together." },
      { property: "og:description", content: "The AI operating system for community engagement and real-world organizing." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <SiteLayout>
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Build communities. Bring people together.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          CiviMeet uses AI community organizers to help organizations establish a meaningful presence online,
          stay connected with their communities, and coordinate real-world gatherings.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>Launch Your AI Organizer</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/how-it-works">Explore the Platform</Link>
          </Button>
        </div>
      </section>

      <section className="border-y bg-muted">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-3">
          {stages.map((s, i) => (
            <div key={s.name} className="rounded-lg border bg-card p-6">
              <p className="text-sm font-medium text-primary">Stage {i + 1}</p>
              <h3 className="mt-1 text-xl font-semibold">{s.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold">Platform capabilities</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {features.map((f) => (
            <div key={f.name} className="rounded-lg border p-4">
              <h3 className="text-sm font-semibold">{f.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
        <Link to="/product" className="mt-6 inline-block text-sm font-medium text-primary">See all features →</Link>
      </section>

      <section className="border-y bg-muted">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold">Solutions</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {solutions.map((s) => (
              <Link key={s.slug} to="/solutions/$slug" params={{ slug: s.slug }} className="rounded-lg border bg-card p-5 hover:border-primary">
                <h3 className="font-semibold">{s.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold">Proposed pricing</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className="rounded-lg border p-6">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-3 text-xs text-muted-foreground">{p.note}&nbsp;</p>
              <p className="text-3xl font-semibold">{p.price}<span className="text-base font-normal text-muted-foreground">{p.unit}</span></p>
              <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
        <Link to="/pricing" className="mt-6 inline-block text-sm font-medium text-primary">Pricing details →</Link>
      </section>
    </SiteLayout>
  );
}
