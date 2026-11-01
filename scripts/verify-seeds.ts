/**
 * Has the independent verifier agent re-read every page a seed guide cites and judge each claim.
 * Usage: ANTHROPIC_API_KEY=... npm run verify-seeds            (prints results)
 *        ANTHROPIC_API_KEY=... npm run verify-seeds -- --write (records statuses in data/guides/*.json)
 * Seed claims start as "not_checked" because they were first read through a summarising fetch tool.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLlm, hasApiKey, modelName } from '../src/lib/llm';
import { PageCache, fetchPage } from '../src/lib/fetch-page';
import { verifyClaims } from '../src/lib/pipeline';
import { seedGuides } from '../src/lib/seeds';

async function main() {
  if (!hasApiKey()) {
    console.error('Set ANTHROPIC_API_KEY.');
    process.exit(2);
  }
  const write = process.argv.includes('--write');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const llm = createLlm();
  const model = modelName();

  for (const g of seedGuides.filter((s) => only.length === 0 || only.includes(s.slug))) {
    const cache = new PageCache();
    const urls = [...new Set(g.claims.flatMap((c) => c.sources))];
    for (const u of urls) cache.set(u, await fetchPage(u));
    const unreadable = urls.filter((u) => !cache.get(u)?.ok);
    const result = await verifyClaims(
      g.claims.map(({ check: _c, ...c }) => c),
      cache,
      { llm, model, emit: () => {} },
    );
    console.log(`\n== ${g.slug} (${g.claims.length} claims, ${unreadable.length} page(s) unreadable from here)`);
    for (const u of unreadable) console.log(`   cannot read: ${u} (${cache.get(u)?.error})`);
    for (const c of result.claims) {
      if (c.check.status !== 'supported') console.log(`   ${c.id} ${c.check.status}: ${c.text.slice(0, 90)}\n      ${c.check.note}`);
    }
    const ok = result.claims.filter((c) => c.check.status === 'supported').length;
    console.log(`   supported ${ok}/${g.claims.length}`);

    if (write) {
      const file = path.join('data', 'guides', `${g.slug}.json`);
      const json = JSON.parse(await fs.readFile(file, 'utf8'));
      const byId = new Map(result.claims.map((c) => [c.id, c]));
      json.claims = json.claims.map((c: { id: string; check: unknown; evidence: string }) => {
        const v = byId.get(c.id);
        // Only record real verifier outcomes. Never downgrade silently: a human reviews the diff.
        return v && v.check.status !== 'not_checked' ? { ...c, check: v.check, evidence: v.evidence } : c;
      });
      json.corrections = [...json.corrections, ...result.corrections];
      await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n');
    }
  }
  if (write) console.log('\nRecorded. Review `git diff data/guides` before committing, then run npm test.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
