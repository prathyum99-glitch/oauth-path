import { seedGuides } from '../src/lib/seeds';
import { guideProblems } from '../src/lib/integrity';

let bad = 0;
for (const g of seedGuides) {
  const problems = guideProblems(g);
  const counts = g.claims.reduce<Record<string, number>>((acc, c) => ((acc[c.evidence] = (acc[c.evidence] ?? 0) + 1), acc), {});
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${g.slug.padEnd(9)} ${g.verdict.difficulty.padEnd(8)} claims ${JSON.stringify(counts)}`);
  for (const p of problems) console.log(`       - ${p}`);
  bad += problems.length;
}
if (bad) {
  console.error(`\n${bad} problem(s)`);
  process.exit(1);
}
console.log(`\n${seedGuides.length} seed guides valid`);
