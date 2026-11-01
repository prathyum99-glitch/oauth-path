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

test('with an access code set, the agent refuses a missing or wrong code and the right one gets past the gate', async () => {
  process.env.ACCESS_CODE = 'open-sesame';
  try {
    const none = await post({ query: 'Slack' });
    assert.equal(none.status, 401);
    assert.match(((await none.json()) as { error: string }).error, /access code/);

    const wrong = await post({ query: 'Slack', code: 'nope' });
    assert.equal(wrong.status, 401);
    assert.match(((await wrong.json()) as { error: string }).error, /not right/);

    // With the right code the request reaches the next check, which here is "no model key on this server".
    const right = await post({ query: 'Slack', code: '  open-sesame ' });
    assert.equal(right.status, 503);
  } finally {
    delete process.env.ACCESS_CODE;
  }
});

test('repeated wrong codes from one address are throttled', async () => {
  process.env.ACCESS_CODE = 'open-sesame';
  try {
    const mk = (code: string) =>
      POST(new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ query: 'Slack', code }),
      }));
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await mk(`guess-${i}`)).status;
    assert.equal(last, 429);
  } finally {
    delete process.env.ACCESS_CODE;
  }
});
