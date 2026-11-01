import test from 'node:test';
import assert from 'node:assert/strict';
import { seedGuides } from '../src/lib/seeds';
import { guideProblems } from '../src/lib/integrity';
import { guideToMarkdown } from '../src/lib/markdown';
import { liveSlugFor } from '../src/lib/storage';

test('every seed guide is internally consistent', () => {
  assert.equal(seedGuides.length, 6);
  for (const g of seedGuides) assert.deepEqual(guideProblems(g), [], g.slug);
});

test('seeds never claim to be tested or re-checked', () => {
  for (const g of seedGuides) {
    assert.equal(g.handsOn.tested, false, g.slug);
    assert.equal(g.origin, 'seed');
    assert.ok(g.claims.every((c) => c.check.status === 'not_checked'), `${g.slug} claims must be not_checked`);
  }
});

test('seed slugs are unique and the set covers every grade', () => {
  assert.equal(new Set(seedGuides.map((g) => g.slug)).size, seedGuides.length);
  assert.deepEqual([...new Set(seedGuides.map((g) => g.verdict.difficulty))].sort(), ['easy', 'gated', 'hard', 'moderate']);
});

test('a live guide never overwrites a seed slug', () => {
  assert.equal(liveSlugFor('gmail'), 'gmail-live');
  assert.equal(liveSlugFor('quickbooks'), 'quickbooks');
});

test('markdown export has the sections a reader needs', () => {
  const md = guideToMarkdown(seedGuides[0], 'https://example.com/g/gmail');
  for (const h of ['## Steps', '## What the agent can do', '## Evidence', '## Sources', 'Not tested hands-on']) assert.ok(md.includes(h), h);
});

test('integrity check catches a broken reference and an unread official claim', () => {
  const g = structuredClone(seedGuides[1]);
  g.steps[0].refs = ['nope'];
  g.sources = g.sources.map((s) => ({ ...s, status: 'unreachable' as const }));
  const problems = guideProblems(g).join('\n');
  assert.match(problems, /missing claim nope/);
  assert.match(problems, /cites no source that was read/);
});
