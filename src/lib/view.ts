import type { CheckStatus, Evidence, Guide } from './schema';

export type GuideSummary = {
  slug: string;
  name: string;
  category: string;
  difficulty: Guide['verdict']['difficulty'];
  headline: string;
  effortLabel: string;
  waitLabel: string;
  origin: Guide['origin'];
};

export function summarize(g: Guide): GuideSummary {
  return {
    slug: g.slug,
    name: g.app.name,
    category: g.app.category,
    difficulty: g.verdict.difficulty,
    headline: g.verdict.headline,
    effortLabel: g.verdict.effort.label,
    waitLabel: g.verdict.wait.label,
    origin: g.origin,
  };
}

const RANK: Record<Evidence, number> = { unverified: 0, inferred: 1, secondary: 2, official: 3 };

/** The weakest evidence among the referenced claims, or null when nothing is referenced. */
export function weakestEvidence(g: Guide, refs: string[]): Evidence | null {
  let worst: Evidence | null = null;
  for (const r of refs) {
    const c = g.claims.find((x) => x.id === r);
    if (!c) continue;
    if (worst === null || RANK[c.evidence] < RANK[worst]) worst = c.evidence;
  }
  return worst;
}

export const CHECK_COPY: Record<CheckStatus, string> = {
  supported: 'Re-read and confirmed',
  partial: 'Partly confirmed',
  unsupported: 'Page does not confirm it',
  unreachable: 'Page could not be re-read',
  not_checked: 'Not re-checked',
};

export function evidenceCounts(g: Guide): Record<Evidence, number> {
  const out: Record<Evidence, number> = { official: 0, secondary: 0, inferred: 0, unverified: 0 };
  for (const c of g.claims) out[c.evidence] += 1;
  return out;
}
