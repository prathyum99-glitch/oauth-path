import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftSchema, SLUG_RE, slugify, toToolSchema } from '../src/lib/schema';

test('slugify makes safe slugs', () => {
  assert.equal(slugify('QuickBooks Online'), 'quickbooks-online');
  assert.equal(slugify('  Café & Co. '), 'cafe-co');
  assert.equal(slugify('###'), 'app');
  assert.ok(SLUG_RE.test(slugify('A'.repeat(200))));
});

test('SLUG_RE rejects path tricks', () => {
  for (const bad of ['../etc', 'a/b', 'A', '', '-x', 'a.json', 'a b']) assert.equal(SLUG_RE.test(bad), false, bad);
});

test('toToolSchema strips keywords strict tools reject', () => {
  const json = JSON.stringify(toToolSchema(DraftSchema));
  for (const k of ['"$schema"', '"minLength"', '"maxLength"', '"minItems"', '"maxItems"', '"pattern"', '"format"', '"default"']) {
    assert.ok(!json.includes(k), `${k} should be stripped`);
  }
  assert.ok(json.includes('"claims"'));
});
