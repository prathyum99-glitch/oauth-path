import { DIFFICULTY_COPY, EVIDENCE_COPY, type Guide } from './schema';
import { CHECK_COPY } from './view';

const WHO = { agent: 'Agent', you: 'You', both: 'Agent + you' } as const;

/** Plain Markdown a developer can paste into Notion, a README or a ticket. */
export function guideToMarkdown(g: Guide, url?: string): string {
  const L: string[] = [];
  L.push(`# ${g.app.name}: OAuth app setup and approval`);
  L.push('');
  L.push(`**${DIFFICULTY_COPY[g.verdict.difficulty].label}.** ${g.verdict.headline}`);
  L.push('');
  L.push(`- Your time: ${g.verdict.effort.label}`);
  L.push(`- Provider wait: ${g.verdict.wait.label} (${g.verdict.wait.basis === 'none' ? 'no source gives a figure' : `basis: ${g.verdict.wait.basis}`})`);
  L.push(`- Researched on ${g.researchedOn}. ${g.handsOn.tested ? g.handsOn.note : 'Not tested hands-on.'}`);
  if (url) L.push(`- Guide: ${url}`);
  L.push('');
  L.push(g.summary);

  if (g.prerequisites.length) {
    L.push('', '## Before you start', '');
    for (const p of g.prerequisites) L.push(`- **${p.item}.** ${p.detail}`);
  }

  L.push('', '## Steps', '');
  g.steps.forEach((s, i) => {
    L.push(`${i + 1}. **${s.title}** [${WHO[s.who]}]. ${s.detail}${s.link ? ` ${s.link}` : ''}`);
  });

  L.push('', '## What the agent can do, and what only you can', '');
  L.push('Agent can:');
  for (const a of g.handoff.agentCanDo) L.push(`- ${a}`);
  L.push('', 'You must:');
  for (const y of g.handoff.youMustDo) L.push(`- ${y}`);

  if (g.limits.length) {
    L.push('', '## Limits', '');
    for (const l of g.limits) L.push(`- **${l.title}.** ${l.detail}`);
  }
  if (g.blockers.length) {
    L.push('', '## Where it usually gets stuck', '');
    for (const b of g.blockers) L.push(`- **${b.problem}.** ${b.why} Next move: ${b.nextMove}`);
  }
  if (g.uncertainties.length) {
    L.push('', '## What could not be confirmed', '');
    for (const u of g.uncertainties) L.push(`- ${u}`);
  }

  L.push('', '## Evidence', '');
  for (const c of g.claims) {
    L.push(`- [${EVIDENCE_COPY[c.evidence].label}; ${CHECK_COPY[c.check.status]}] ${c.text}`);
  }
  L.push('', '## Sources', '');
  for (const s of g.sources) L.push(`- ${s.title}: ${s.url} (${s.status === 'read' ? 'read' : 'could not be read'})`);
  return L.join('\n');
}
