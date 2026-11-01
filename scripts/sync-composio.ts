/**
 * Looks up each seed app's managed-auth status in Composio's toolkit API.
 * Usage: COMPOSIO_API_KEY=... npm run sync:composio            (prints a table)
 *        COMPOSIO_API_KEY=... npm run sync:composio -- --write (updates data/guides/*.json)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { lookupComposio } from '../src/lib/composio';
import { seedGuides } from '../src/lib/seeds';

async function main() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.error('Set COMPOSIO_API_KEY (Composio dashboard > Settings > API keys).');
    process.exit(2);
  }
  const write = process.argv.includes('--write');
  for (const g of seedGuides) {
    const c = await lookupComposio(g.app.name);
    console.log(`${g.slug.padEnd(10)} ${c.managedAuth.padEnd(8)} ${c.source.padEnd(5)} ${c.note}`);
    if (write && c.source === 'api' && c.managedAuth !== 'unknown') {
      const file = path.join('data', 'guides', `${g.slug}.json`);
      const json = JSON.parse(await fs.readFile(file, 'utf8'));
      json.composio = c;
      await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n');
    }
  }
  if (write) console.log('\nUpdated seed files where the API gave a definite answer. Review the diff before committing.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
