import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type Storage = typeof import('../src/lib/storage');
type Seeds = typeof import('../src/lib/seeds');
let dir = '';
let getGuide: Storage['getGuide'];
let listGuides: Storage['listGuides'];
let persistenceMode: Storage['persistenceMode'];
let saveLiveGuide: Storage['saveLiveGuide'];
let seedGuides: Seeds['seedGuides'];

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oauth-path-test-'));
  process.env.GUIDE_DATA_DIR = dir;
  for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
  ({ getGuide, listGuides, persistenceMode, saveLiveGuide } = await import('../src/lib/storage'));
  ({ seedGuides } = await import('../src/lib/seeds'));
});

test('file storage round-trips a live guide and lists it after the seeds', async () => {
  assert.equal(persistenceMode(), 'file');
  const g = { ...structuredClone(seedGuides[2]), slug: 'zoom', origin: 'live' as const, model: 'm' };
  await saveLiveGuide(g);
  assert.equal((await getGuide('zoom'))?.app.name, 'Discord');
  const all = await listGuides();
  assert.equal(all.length, seedGuides.length + 1);
  assert.equal(all.at(-1)?.slug, 'zoom');
});

test('storage refuses bad slugs and ignores corrupt files', async () => {
  await assert.rejects(saveLiveGuide({ ...structuredClone(seedGuides[0]), slug: '../evil' }), /Invalid slug/);
  assert.equal(await getGuide('..%2Fx'), null);
  await fs.writeFile(path.join(dir, 'broken.json'), '{ not json', 'utf8');
  assert.equal(await getGuide('broken'), null);
  assert.ok((await listGuides()).every((g) => g.slug !== 'broken'));
});

test('a seed slug always resolves to the seed, even if a live file shares it', async () => {
  await fs.writeFile(path.join(dir, 'gmail.json'), JSON.stringify({ ...seedGuides[0], app: { ...seedGuides[0].app, name: 'Imposter' } }), 'utf8');
  assert.equal((await getGuide('gmail'))?.app.name, 'Gmail');
});
