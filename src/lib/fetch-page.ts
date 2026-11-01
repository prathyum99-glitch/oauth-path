import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';

export type PageResult = {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  title: string;
  text: string;
  truncated: boolean;
  error?: string;
};

const MAX_BYTES = 2_000_000;
const MAX_CHARS = 40_000;
const MIN_READABLE_CHARS = 300;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const UA = 'oauth-path-research/1.0 (research agent for OAuth setup guides)';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function inV4Block(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
}

/** True for loopback, private, link-local, multicast and other non-public addresses. Non-IPs count as unsafe. */
export function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return V4_BLOCKS.some(([base, bits]) => inV4Block(ip, base, bits));
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateIp(dotted[1]);
    const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return true;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Blocked: address is not public');
    return;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('Blocked: internal hostname');
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('Blocked: host resolves to a non-public address');
  }
}

export function htmlToText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || $('h1').first().text().trim();
  $('script,style,noscript,svg,iframe,form,template,[hidden],[aria-hidden="true"]').remove();
  $('nav,footer').remove();
  $('br').replaceWith('\n');
  $('h1,h2,h3,h4,h5,h6,p,li,tr,pre,blockquote,section,article,div,dt,dd').each((_, el) => {
    $(el).append('\n');
  });
  const root = $('main').length ? $('main').first() : $('article').length ? $('article').first() : $('body');
  const text = root
    .text()
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return out + decoder.decode();
}

export async function fetchPage(
  rawUrl: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<PageResult> {
  const base: PageResult = { url: rawUrl, finalUrl: rawUrl, status: 0, ok: false, title: '', text: '', truncated: false };
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    let current = new URL(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== 'https:') throw new Error('Only https URLs are fetched');
      if (current.username || current.password) throw new Error('URLs with credentials are blocked');
      if (current.port && current.port !== '443') throw new Error('Only the default https port is allowed');
      await assertPublicHost(current.hostname);

      const res = await doFetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': UA, accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
      });

      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }

      const result: PageResult = { ...base, finalUrl: current.toString(), status: res.status };
      if (!res.ok) return { ...result, error: `HTTP ${res.status}` };

      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!/(text\/|application\/(xhtml\+xml|json))/.test(type)) {
        return { ...result, error: `Unsupported content type: ${type || 'unknown'}` };
      }

      const raw = await readCapped(res, MAX_BYTES);
      const parsed = type.includes('html') ? htmlToText(raw) : { title: '', text: raw.trim() };
      const truncated = parsed.text.length > MAX_CHARS;
      const text = truncated ? parsed.text.slice(0, MAX_CHARS) : parsed.text;

      if (text.length < MIN_READABLE_CHARS) {
        return {
          ...result,
          title: parsed.title,
          text,
          error: 'Page returned almost no readable text. It is probably rendered in the browser, so it cannot be used as evidence.',
        };
      }
      return { ...result, ok: true, title: parsed.title, text, truncated };
    }
    throw new Error('Too many redirects');
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Per-run page store so the verifier re-reads exactly what the researcher saw. */
export class PageCache {
  private pages = new Map<string, PageResult>();
  get(url: string): PageResult | undefined {
    return this.pages.get(url);
  }
  set(url: string, page: PageResult): void {
    this.pages.set(url, page);
  }
  values(): PageResult[] {
    return [...this.pages.values()];
  }
}
