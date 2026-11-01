import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CopyBar } from '@/components/CopyBar';
import { GuideView } from '@/components/GuideView';
import { SLUG_RE } from '@/lib/schema';
import { guideToMarkdown } from '@/lib/markdown';
import { getGuide, persistenceMode } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return { title: 'Guide not found' };
  const g = await getGuide(slug);
  if (!g) return { title: 'Guide not found' };
  return { title: `${g.app.name} OAuth app guide`, description: g.verdict.headline };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const guide = await getGuide(slug);
  if (!guide) notFound();
  return (
    <>
      <CopyBar markdown={guideToMarkdown(guide, '{{URL}}')} />
      <GuideView guide={guide} persistent={persistenceMode() === 'redis'} />
    </>
  );
}
