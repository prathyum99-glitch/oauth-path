import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { lookupComposio, slugCandidates } from '../src/lib/composio';

afterEach(() => {
  delete process.env.COMPOSIO_API_KEY;
});

type Call = { url: string; headers: Record<string, string> };

/** A fake fetch that answers by toolkit slug and records what it was asked. */
function fakeFetch(answers: Record<string, { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const slug = decodeURIComponent(url.split('/').pop() ?? '');
    const a = answers[slug] ?? { status: 404 };
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status });
  }) as typeof fetch;
  return { impl, calls };
}

test('slug candidates shorten a long app name', () => {
  assert.deepEqual(slugCandidates('QuickBooks Online (Intuit Developer)'), ['quickbooksonline', 'quickbooks', 'quickbooksonlineintuitdeveloper']);
  assert.deepEqual(slugCandidates('Slack'), ['slack']);
  assert.deepEqual(slugCandidates('!!!'), []);
});

test('no key means not checked, with no network call', async () => {
  const f = fakeFetch({});
  const r = await lookupComposio('Slack', f.impl);
  assert.equal(r.managedAuth, 'unknown');
  assert.equal(r.source, 'none');
  assert.equal(f.calls.length, 0);
});

test('falls back to the short slug and reports managed auth', async () => {
  process.env.COMPOSIO_API_KEY = '  pk_test_key\n';
  const f = fakeFetch({ quickbooks: { status: 200, body: { composio_managed_auth_schemes: ['OAUTH2'] } } });
  const r = await lookupComposio('QuickBooks Online (Intuit Developer)', f.impl);
  assert.equal(r.managedAuth, 'yes');
  assert.match(r.note, /"quickbooks"/);
  assert.equal(f.calls[0].headers['x-api-key'], 'pk_test_key', 'the key is trimmed before it is sent');
});

test('an empty scheme list means register your own', async () => {
  process.env.COMPOSIO_API_KEY = 'pk_test_key';
  const f = fakeFetch({ calendly: { status: 200, body: { composio_managed_auth_schemes: [] } } });
  const r = await lookupComposio('Calendly', f.impl);
  assert.equal(r.managedAuth, 'no');
});

test('a rejected key stops at once and says so', async () => {
  process.env.COMPOSIO_API_KEY = 'pk_bad';
  const f = fakeFetch({ quickbooksonline: { status: 401 } });
  const r = await lookupComposio('QuickBooks Online (Intuit Developer)', f.impl);
  assert.equal(r.managedAuth, 'unknown');
  assert.match(r.note, /rejected the API key \(HTTP 401\)/);
  assert.equal(f.calls.length, 1);
});

test('user keys use their own header', async () => {
  process.env.COMPOSIO_API_KEY = 'uak_abc';
  const f = fakeFetch({ slack: { status: 200, body: { composio_managed_auth_schemes: ['OAUTH2'] } } });
  await lookupComposio('Slack', f.impl);
  assert.equal(f.calls[0].headers['x-user-api-key'], 'uak_abc');
  assert.equal(f.calls[0].headers['x-api-key'], undefined);
});

test('no toolkit under any candidate says where to look', async () => {
  process.env.COMPOSIO_API_KEY = 'pk_test_key';
  const f = fakeFetch({});
  const r = await lookupComposio('Acme Widgets (Beta)', f.impl);
  assert.equal(r.managedAuth, 'unknown');
  assert.match(r.note, /No Composio toolkit found/);
  assert.equal(f.calls.length, 3, 'tries the name without brackets, the first word, then the full name');
});
