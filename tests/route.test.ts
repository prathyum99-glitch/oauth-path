import test, { before } from 'node:test';
import assert from 'node:assert/strict';

let POST: typeof import('../src/app/api/generate/route').POST;
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  ({ POST } = await import('../src/app/api/generate/route'));
});

const post = (body: unknown, raw = false) =>
  POST(new Request('http://localhost/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) }));

test('generate rejects malformed, empty and oversized queries before touching the model', async () => {
  assert.equal((await post('not json', true)).status, 400);
  assert.equal((await post({ query: '' })).status, 400);
  assert.equal((await post({ query: 7 })).status, 400);
  const long = await post({ query: 'a'.repeat(121) });
  assert.equal(long.status, 400);
});

test('generate says plainly when live generation is off', async () => {
  const res = await post({ query: 'Slack' });
  assert.equal(res.status, 503);
  assert.match(((await res.json()) as { error: string }).error, /ANTHROPIC_API_KEY/);
});
