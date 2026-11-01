import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Generator } from '@/components/Generator';
import { hasApiKey } from '@/lib/llm';

export const metadata: Metadata = { title: 'Investigate an app' };
export const dynamic = 'force-dynamic';

export default function NewGuide() {
  return (
    <>
      <section className="hero hero--tight">
        <h1 className="hero__title">Investigate an app</h1>
        <p className="hero__lede">
          Type an app name or its website. An agent finds the provider's developer pages, reads them, writes the guide, and a second agent
          re-reads every cited page against the claims. You get a link you can share.
        </p>
      </section>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Generator canGenerate={hasApiKey()} />
      </Suspense>
    </>
  );
}
