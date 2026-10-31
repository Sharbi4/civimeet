import { useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { SiteLayout } from "./SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { demoRequestSchema, organizationTypes, type DemoRequest, type DemoRequestResult } from "@/lib/demo-request";
import { submitDemoRequest } from "@/lib/demo-request.functions";

export function DemoRequestForm({ source, send }: {
  source: "contact" | "get-started";
  send: (data: DemoRequest) => Promise<DemoRequestResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const submissionKey = useRef<string | undefined>(undefined);
  const sending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = new FormData(event.currentTarget);
    submissionKey.current ??= crypto.randomUUID();
    const parsed = demoRequestSchema.safeParse({ ...Object.fromEntries(form), source, submissionKey: submissionKey.current });
    setError("");
    setFields({});
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFields(errors);
      setError("Please check the highlighted fields.");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const result = await send(parsed.data);
      if (result.saved) setSaved(true);
      else setError(result.error ?? "Your request could not be saved. Please try again.");
    } catch {
      setError("Your request could not be saved. Please try again or contact support@civimeet.com.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  if (saved) return (
    <div role="status" className="space-y-5 py-10">
      <CheckCircle2 className="size-10 text-primary" aria-hidden="true" />
      <h2 className="text-3xl">Your demo request is saved.</h2>
      <p>Thank you for reaching out. The CiviMeet team can follow up using the email you provided.</p>
      <Button asChild variant="outline"><Link to="/product">Explore CiviMeet <ArrowUpRight /></Link></Button>
    </div>
  );
  const fieldError = (name: string) => fields[name] ? <p id={`${name}-error`} className="text-sm text-destructive">{fields[name]}</p> : null;
  return (
    <form onSubmit={submit} noValidate className="space-y-6" aria-label="Demo request">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="demo-name">Your name</Label><Input id="demo-name" name="name" autoComplete="name" required maxLength={100} aria-invalid={!!fields.name} aria-describedby={fields.name ? "name-error" : undefined} />{fieldError("name")}</div>
        <div className="space-y-2"><Label htmlFor="demo-email">Email address</Label><Input id="demo-email" name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : undefined} />{fieldError("email")}</div>
      </div>
      <div className="space-y-2"><Label htmlFor="demo-org">Organization</Label><Input id="demo-org" name="organization" autoComplete="organization" required maxLength={150} aria-invalid={!!fields.organization} aria-describedby={fields.organization ? "organization-error" : undefined} />{fieldError("organization")}</div>
      <div className="space-y-2"><Label htmlFor="demo-type">Organization type</Label><select id="demo-type" name="organizationType" required defaultValue="" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-invalid={!!fields.organizationType} aria-describedby={fields.organizationType ? "organizationType-error" : undefined}><option value="" disabled>Select your organization type</option>{organizationTypes.map(type => <option value={type.value} key={type.value}>{type.label}</option>)}</select>{fieldError("organizationType")}</div>
      <div className="space-y-2"><Label htmlFor="demo-message">What would you like help with? <span className="text-muted-foreground">(optional)</span></Label><Textarea id="demo-message" name="message" maxLength={2000} rows={4} aria-invalid={!!fields.message} aria-describedby={fields.message ? "message-error" : undefined} />{fieldError("message")}</div>
      <div hidden aria-hidden="true"><label htmlFor="demo-website">Website</label><input id="demo-website" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></div>
      <p className="text-sm text-muted-foreground">We’ll use these details to follow up about your request. Please don’t include sensitive community or account information. <Link to="/privacy" className="text-primary underline underline-offset-4">Privacy</Link></p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto">{busy ? <><Loader2 className="animate-spin motion-reduce:animate-none" />Saving request…</> : <>Request a demo <ArrowUpRight /></>}</Button>
    </form>
  );
}

export function DemoRequestPage({ source }: { source: "contact" | "get-started" }) {
  const submit = useServerFn(submitDemoRequest);
  return <SiteLayout>
    <section className="mx-auto grid max-w-6xl gap-12 px-5 py-14 md:grid-cols-2 md:gap-16 md:py-20">
      <div>
        <p className="text-sm text-primary">LET’S TALK COMMUNITY</p>
        <h1 className="mt-4 max-w-md text-4xl leading-tight md:text-5xl">Bring your community to CiviMeet.</h1>
        <p className="mt-6 max-w-md text-lg text-muted-foreground">Tell us about your organization and what you want to bring to life. Request a demo with the CiviMeet team.</p>
        <img src="/product/conversation-640.jpg" srcSet="/product/conversation-640.jpg 640w, /product/conversation-1280.jpg 1280w" sizes="(max-width: 767px) 100vw, 45vw" alt="People sharing a conversation around a community table" width={1280} height={854} className="mt-8 aspect-[3/2] w-full rounded-md object-cover" />
        <p className="mt-2 text-xs text-muted-foreground">Photo: Pexels. People pictured are not CiviMeet customers.</p>
        <p className="mt-7 text-sm">Prefer email? <a href="mailto:support@civimeet.com" className="text-primary underline underline-offset-4">support@civimeet.com</a></p>
        <p className="mt-3 text-sm">Already have an account? <Link to="/auth" className="text-primary underline underline-offset-4">Sign in</Link> · <Link to="/auth" search={{ mode: "signup" }} className="text-primary underline underline-offset-4">Create an account</Link></p>
      </div>
      <div className="border-t pt-8 md:border-t-0 md:pt-2">
        <h2 className="mb-7 text-2xl">Request your demo</h2>
        <DemoRequestForm source={source} send={data => submit({ data })} />
      </div>
    </section>
  </SiteLayout>;
}