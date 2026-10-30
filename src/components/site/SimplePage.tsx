import type { ReactNode } from "react";
import { PageHeader, SiteLayout } from "./SiteLayout";

export function SimplePage({ eyebrow, title, intro, draft, children }: { eyebrow: string; title: string; intro?: string; draft?: boolean; children: ReactNode }) {
  return (
    <SiteLayout>
      <PageHeader eyebrow={eyebrow} title={title} intro={intro} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-sm leading-relaxed">
        {draft && (
          <div className="rounded-md border border-primary bg-accent p-4 text-accent-foreground">
            Draft: final legal language is pending review. This page is not a binding agreement.
          </div>
        )}
        {children}
      </div>
    </SiteLayout>
  );
}
