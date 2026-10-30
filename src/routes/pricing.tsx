import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, SiteLayout } from "@/components/site/SiteLayout";
import { plans } from "@/lib/site-content";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — CiviMeet" },
      { name: "description", content: "Proposed CiviMeet plans: Community, Civic, and Enterprise." },
      { property: "og:title", content: "CiviMeet Pricing" },
      { property: "og:description", content: "Community from $250/month, Civic from $1,000/month, Enterprise custom." },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader eyebrow="Pricing" title="Proposed plans" intro="These are preliminary plans. Billing is not active yet, and no payment is collected." />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} className="flex flex-col rounded-lg border p-6">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-3 text-xs text-muted-foreground">{p.note}&nbsp;</p>
            <p className="text-4xl font-semibold">{p.price}<span className="text-base font-normal text-muted-foreground">{p.unit}</span></p>
            <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.text}</p>
            <Button asChild className="mt-6" variant={p.name === "Enterprise" ? "outline" : "default"}>
              {p.name === "Enterprise" ? <Link to="/contact">Contact us</Link> : <Link to="/auth" search={{ mode: "signup" }}>Get Started</Link>}
            </Button>
          </div>
        ))}
      </div>
    </SiteLayout>
  ),
});
