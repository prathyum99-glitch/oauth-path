import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { GuideSchema, SLUG_RE, type Guide } from './schema';
import { seedGuides } from './seeds';

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

/** 'redis' keeps live guides across deploys and instances. 'file' is a local or best-effort temp directory. */
export function persistenceMode(): 'redis' | 'file' {
  return redis() ? 'redis' : 'file';
}

function dataDir(): string {
  return process.env.GUIDE_DATA_DIR || path.join(os.tmpdir(), 'oauth-path-guides');
}

export async function saveLiveGuide(guide: Guide): Promise<void> {
  if (!SLUG_RE.test(guide.slug)) throw new Error('Invalid slug');
  const r = redis();
  if (r) {
    await r.set(`guide:${guide.slug}`, JSON.stringify(guide));
    await r.sadd('guides', guide.slug);
    return;
  }
  await fs.mkdir(/*turbopackIgnore: true*/ dataDir(), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ path.join(dataDir(), `${guide.slug}.json`), JSON.stringify(guide, null, 2), 'utf8');
}

function parseGuide(raw: unknown): Guide | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const parsed = GuideSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getLiveGuide(slug: string): Promise<Guide | null> {
  if (!SLUG_RE.test(slug)) return null;
  const r = redis();
  if (r) return parseGuide(await r.get(`guide:${slug}`));
  try {
    return parseGuide(await fs.readFile(/*turbopackIgnore: true*/ path.join(dataDir(), `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function listLiveGuides(): Promise<Guide[]> {
  const r = redis();
  const out: Guide[] = [];
  if (r) {
    const slugs = ((await r.smembers('guides')) as string[]) ?? [];
    for (const s of slugs) {
      const g = await getLiveGuide(s);
      if (g) out.push(g);
    }
    return out;
  }
  try {
    const files = await fs.readdir(/*turbopackIgnore: true*/ dataDir());
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const g = await getLiveGuide(f.replace(/\.json$/, ''));
      if (g) out.push(g);
    }
  } catch {
    /* directory does not exist yet */
  }
  return out;
}

export async function getGuide(slug: string): Promise<Guide | null> {
  const seed = seedGuides.find((g) => g.slug === slug);
  if (seed) return seed;
  return getLiveGuide(slug);
}

export async function listGuides(): Promise<Guide[]> {
  let live: Guide[] = [];
  try {
    live = await listLiveGuides();
  } catch {
    /* storage unavailable: still show seeds */
  }
  const seen = new Set(seedGuides.map((g) => g.slug));
  return [...seedGuides, ...live.filter((g) => !seen.has(g.slug))];
}

/** Picks a slug that does not overwrite a seed guide. */
export function liveSlugFor(baseSlug: string): string {
  return seedGuides.some((g) => g.slug === baseSlug) ? `${baseSlug}-live`.slice(0, 64) : baseSlug;
}
