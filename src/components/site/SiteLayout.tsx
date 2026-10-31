import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/product", label: "Product" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/solutions", label: "Solutions" },
  { to: "/pricing", label: "Pricing" },
] as const;

export function Logo() {
  return (
    <Link to="/" className="flex items-center" aria-label="CiviMeet home">
      <img
        src="/brand/civimeet-wordmark.svg"
        alt="CiviMeet"
        width={2020}
        height={440}
        className="h-10 w-auto max-w-[190px] object-contain"
      />
    </Link>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-sm font-medium text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get Started
              </Link>
            </Button>
          </div>
          <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="border-t px-4 py-3 md:hidden">
            <div className="flex flex-col gap-3">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-sm">
                  {n.label}
                </Link>
              ))}
              <Link to="/auth" className="text-sm">
                Sign In
              </Link>
              <Button asChild size="sm">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get Started
                </Link>
              </Button>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-muted">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
            <Link to="/product" className="hover:text-foreground">
              Features
            </Link>
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              Contact
            </Link>
            <Link to="/agent" className="hover:text-foreground">
              Research Preview
            </Link>
            <Link to="/dashboard" className="hover:text-foreground">
              Community Dashboard
            </Link>
            <Link to="/vendors" className="hover:text-foreground">
              Vendor Directory
            </Link>
            <Link to="/platform-agents" className="hover:text-foreground">
              Platform Agents
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/auth" className="hover:text-foreground">
              Sign In
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pb-8 text-center text-xs text-muted-foreground">
          <span>© 2026 CiviMeet</span>
          <a href="mailto:support@civimeet.com" className="underline-offset-4 hover:text-foreground hover:underline">
            support@civimeet.com
          </a>
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string | undefined;
  title: string;
  intro?: string | undefined;
}) {
  return (
    <section className="border-b bg-muted">
      <div className="mx-auto max-w-6xl px-4 py-14">
        {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {intro && <p className="mt-3 max-w-2xl text-muted-foreground">{intro}</p>}
      </div>
    </section>
  );
}
