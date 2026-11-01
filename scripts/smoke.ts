/**
 * End-to-end check of the live pipeline against the real model and the real web.
 * Usage: ANTHROPIC_API_KEY=... npm run smoke -- "QuickBooks"
 * Writes the guide to .data/smoke-<slug>.json and prints what a reviewer should look at.
 */
import fs from 'node:fs/promises';
import { createLlm, hasApiKey, modelName } from '../src/lib/llm';
import { runPipeline } from '../src/lib/pipeline';
import { guideProblems } from '../src/lib/integrity';

async function main() {
  const query = process.argv.slice(2).join(' ').trim() || 'Discord';
  if (!hasApiKey()) {
    console.error('Set ANTHROPIC_API_KEY to run the live pipeline.');
    process.exit(2);
  }
  const started = Date.now();
  const guide = await runPipeline(query, {
    llm: createLlm(),
    model: modelName(),
    emit: (e) => {
      if (e.type === 'stage') console.log(`\n[${e.stage}] ${e.message}`);
      else if (e.type === 'search') console.log(`  search: ${e.query}`);
      else if (e.type === 'source') console.log(`  ${e.ok ? 'read ' : 'FAILED'} ${e.url}${e.ok ? '' : ` (${e.note})`}`);
      else if (e.type === 'warn') console.log(`  warn: ${e.message}`);
    },
  });
  const secs = Math.round((Date.now() - started) / 1000);
  await fs.mkdir('.data', { recursive: true });
  const file = `.data/smoke-${guide.slug}.json`;
  await fs.writeFile(file, JSON.stringify(guide, null, 2));

  const tally = guide.claims.reduce<Record<string, number>>((a, c) => ((a[`${c.evidence}/${c.check.status}`] = (a[`${c.evidence}/${c.check.status}`] ?? 0) + 1), a), {});
  console.log(`\n${guide.app.name}: ${guide.verdict.difficulty}. ${guide.verdict.headline}`);
  console.log(`effort: ${guide.verdict.effort.label} | wait: ${guide.verdict.wait.label} (${guide.verdict.wait.basis})`);
  console.log(`sources read: ${guide.sources.filter((s) => s.status === 'read').length}/${guide.sources.length}`);
  console.log(`claims (evidence/check):`, tally);
  console.log(`corrections: ${guide.corrections.length}, uncertainties: ${guide.uncertainties.length}`);
  console.log(`took ${secs}s, saved ${file}`);
  const problems = guideProblems(guide);
  if (problems.length) {
    console.error('\nIntegrity problems:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('integrity: ok');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
