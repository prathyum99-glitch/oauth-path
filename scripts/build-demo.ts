/**
 * Builds a single-file, no-server review copy of the guide library (home board, guide pages, a labelled
 * simulation of the live screen). Usage: npx tsx scripts/build-demo.ts <output.html>
 * The deployed Next.js app is the product; this is only for reviewing the six guides without running it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { seedGuides } from '../src/lib/seeds';

const out = process.argv[2];
if (!out) {
  console.error('Usage: tsx scripts/build-demo.ts <output.html>');
  process.exit(2);
}

// Reuse the app's stylesheet. Fonts come from Google Fonts here, so drop the "Variable" family suffix.
let css = fs.readFileSync(path.join('src', 'app', 'globals.css'), 'utf8').replace(/ Variable/g, '');
css = css.replace(/\.wrap\s*\{[^}]*\}/, '');
css = css.replace(":root:not([data-theme='light']) {", ":root:not([data-theme='light']) {\n    color-scheme: dark;")
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{([^}]*)\}\s*\}/);
const darkTokens = darkBlock ? darkBlock[1] : '';

const client = fs.readFileSync(path.join('scripts', 'demo-client.js'), 'utf8');
const data = JSON.stringify(seedGuides).replace(/</g, '\\u003c');

const html = `<title>OAuth Path</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..800&family=Source+Serif+4:wght@400..700&display=swap">
<style>
${css}
:root[data-theme='dark'] {${darkTokens}}
.wrap { width: 100%; max-width: 1040px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.site__nav a[aria-current='page'] { text-decoration: underline; text-underline-offset: 6px; text-decoration-thickness: 2px; }
.claims__item.hl { background: var(--agent-bg); outline: 2px solid var(--agent); outline-offset: 4px; }
.btn-primary { }
.copybar textarea { width: 100%; }
</style>
<header class="site"><div class="wrap site__inner"><a class="site__brand" href="#"><span class="site__mark" aria-hidden="true"></span>OAuth Path</a><nav id="nav" class="site__nav" aria-label="Main"></nav></div></header>
<main class="wrap main"><div class="notice" role="note" style="margin-top:0;margin-bottom:24px"><strong>Review copy.</strong> The six guides from the OAuth Path repository, with no server behind them. The deployed app also researches any app live.</div><div id="app"></div></main>
<footer class="site-foot"><div class="wrap"><p>Guides are researched from each provider's own pages. Every claim says how it is supported, and nothing is called tested unless a person ran the setup. Provider rules change, so check the linked page before you commit. This is not legal or compliance advice.</p></div></footer>
<script>window.__GUIDES__ = ${data};</script>
<script>
${client}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
