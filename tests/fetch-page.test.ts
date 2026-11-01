import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage, htmlToText, isPrivateIp } from '../src/lib/fetch-page';

test('isPrivateIp blocks internal ranges and allows public ones', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '151.101.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});

test('htmlToText drops scripts, nav and footer', () => {
  const { title, text } = htmlToText('<html><head><title>Docs</title></head><body><nav>Menu</nav><main><h1>OAuth</h1><p>Register your app.</p><script>evil()</script></main><footer>Legal</footer></body></html>');
  assert.equal(title, 'Docs');
  assert.match(text, /Register your app/);
  assert.doesNotMatch(text, /evil|Menu|Legal/);
});

test('fetchPage refuses unsafe targets before any request', async () => {
  let requests = 0;
  const fetchImpl = (async () => (requests++, new Response('x'))) as unknown as typeof fetch;
  for (const url of ['http://example.com/', 'https://localhost/', 'https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/', 'https://example.com:8443/', 'file:///etc/passwd']) {
    const r = await fetchPage(url, { fetchImpl });
    assert.equal(r.ok, false, url);
    assert.ok(r.error, url);
  }
  assert.equal(requests, 0);
});

test('fetchPage blocks a redirect to a private address', async () => {
  const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: 'https://10.0.0.5/admin' } })) as unknown as typeof fetch;
  const r = await fetchPage('https://1.1.1.1/start', { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /not public/);
});

test('fetchPage reads a normal page and flags thin pages as unusable', async () => {
  const body = `<html><head><title>OAuth</title></head><body><main>${'<p>Apps must be reviewed before launch.</p>'.repeat(30)}</main></body></html>`;
  const good = (async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
  const ok = await fetchPage('https://1.1.1.1/docs', { fetchImpl: good });
  assert.equal(ok.ok, true);
  assert.equal(ok.title, 'OAuth');

  const thin = (async () => new Response('<html><body><div id="root"></div></body></html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
  const bad = await fetchPage('https://1.1.1.1/spa', { fetchImpl: thin });
  assert.equal(bad.ok, false);
  assert.match(bad.error ?? '', /rendered in the browser/);

  const pdf = (async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch;
  assert.equal((await fetchPage('https://1.1.1.1/x.pdf', { fetchImpl: pdf })).ok, false);
});
