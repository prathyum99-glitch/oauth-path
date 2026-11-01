import type { Guide } from './schema';

/**
 * Structural checks that a guide's evidence trail is intact: every reference points at a claim,
 * every claim URL is in the source list, and "official" never stands without a source we read.
 * Returns human-readable problems. An empty array means the guide is internally consistent.
 */
export function guideProblems(g: Guide): string[] {
  const problems: string[] = [];
  const claimIds = new Set<string>();
  for (const c of g.claims) {
    if (claimIds.has(c.id)) problems.push(`duplicate claim id ${c.id}`);
    claimIds.add(c.id);
  }

  const refGroups: Array<[string, string[]]> = [['verdict', g.verdict.refs]];
  g.prerequisites.forEach((p, i) => refGroups.push([`prerequisites[${i}]`, p.refs]));
  g.steps.forEach((s, i) => refGroups.push([`steps[${i}]`, s.refs]));
  g.limits.forEach((l, i) => refGroups.push([`limits[${i}]`, l.refs]));
  g.blockers.forEach((b, i) => refGroups.push([`blockers[${i}]`, b.refs]));
  for (const [where, refs] of refGroups) {
    for (const r of refs) if (!claimIds.has(r)) problems.push(`${where} references missing claim ${r}`);
  }

  const readUrls = new Set(g.sources.filter((s) => s.status === 'read').map((s) => s.url));
  const knownUrls = new Set(g.sources.map((s) => s.url));
  for (const c of g.claims) {
    for (const u of c.sources) {
      if (!knownUrls.has(u)) problems.push(`claim ${c.id} cites ${u}, which is not in sources`);
    }
    if (c.evidence === 'official' || c.evidence === 'secondary') {
      if (!c.sources.some((u) => readUrls.has(u))) {
        problems.push(`claim ${c.id} is ${c.evidence} but cites no source that was read`);
      }
    }
  }

  for (const s of g.steps) {
    if (s.link && !/^https:\/\//i.test(s.link)) problems.push(`step "${s.title}" has a non-https link`);
  }
  for (const s of g.sources) {
    if (!/^https:\/\//i.test(s.url)) problems.push(`source ${s.url} is not https`);
  }

  if (g.handsOn.tested && g.origin === 'live') problems.push('a live guide cannot claim hands-on testing');
  if (g.verdict.wait.basis === 'none' && (g.verdict.wait.minDays !== null || g.verdict.wait.maxDays !== null)) {
    problems.push('wait basis is "none" but day numbers are set');
  }
  if (g.verdict.wait.basis !== 'none' && g.verdict.wait.minDays === null && g.verdict.wait.maxDays === null) {
    problems.push(`wait basis is "${g.verdict.wait.basis}" but no day numbers are set`);
  }
  if (g.steps.length === 0) problems.push('no steps');
  if (g.handoff.agentCanDo.length === 0 || g.handoff.youMustDo.length === 0) problems.push('handoff is empty on one side');
  return problems;
}
