import type { ReactNode } from "react";
import { PageHeader, SiteLayout } from "./SiteLayout";

export function SimplePage({ eyebrow, title, intro, updated, children }: { eyebrow: string; title: string; intro?: string | undefined; updated?: string; children: ReactNode }) {
  return (
    <SiteLayout>
      <PageHeader eyebrow={eyebrow} title={title} intro={intro} />
      <div className="legal-copy mx-auto max-w-3xl space-y-4 px-4 py-14 text-sm leading-relaxed [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {updated && <p className="text-muted-foreground">Last updated {updated}</p>}
        {children}
      </div>
    </SiteLayout>
  );
}
