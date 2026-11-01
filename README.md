# OAuth Path

How hard is it to get an OAuth app approved, and what can an agent do for you along the way?

OAuth Path is a library of plain-language guides for setting up an OAuth app with a provider and getting it approved, plus a live mode: type any app name or website and an agent researches it from the provider's own pages, writes a guide, has a second agent re-check every claim, and gives you a link to share.

Built as the take-home for Composio's APM Integrations role.

## What a guide tells you

- **Grade**: Easy, Moderate, Hard or Gated, and why.
- **Your time** and the **provider's wait**. If no source gives a wait, it says "No review time published" instead of guessing.
- **The route**: every step, tagged *agent*, *you* or *both*, with the official page for it.
- **Where the agent stops**: what it can draft, track and wire up, and what only the account owner can do.
- **Limits and blockers**: caps, expiries, the places people get stuck, and the next move.
- **If you use Composio**: whether Composio already provides the OAuth app for this toolkit (read from Composio's API when a key is set), and the callback URL to register.
- **Evidence**: every claim labelled *official*, *secondary*, *inferred* or *unverified*, with its source links, whether a second agent re-read the page, what could not be confirmed, and what was corrected. Nothing is called *tested* unless a person ran the setup.

Copy any guide as a link or as Markdown.

## Guides included

| App | Grade | Why it is in the set |
|---|---|---|
| Discord | Easy | Self-serve, no review for standard scopes, a few partner-only scopes |
| Notion | Easy | Self-serve; optional listing with a stated 5 to 10 business day review; one unresolved approval question |
| Slack | Moderate | Self-serve to install; Marketplace needs 10 active installs first and publishes no review time |
| Gmail (Google) | Hard | Sensitive and restricted scopes, a 100-user cap, a third-party security assessment |
| LinkedIn | Gated | Sign-in is self-serve; almost everything else depends on approval with no timeline |
| Reddit | Gated | Eligibility is decided in review; commercial use needs permission |

Try QuickBooks live as a stress test: Intuit's docs render in the browser, so the agent has to work from thinner sources and the guide should say so.

These six are hand-researched from the providers' pages (2026-11-01) and **have not been run by hand**. See [docs/verification-log.md](docs/verification-log.md) for what was checked, what was learned, and what could not be verified.

## Run it

Needs Node 22 or newer.

```bash
npm install
cp .env.example .env.local     # then fill in what you have
npm run dev                    # http://localhost:3000
```

| Variable | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | Live generation. Without it the six guides still work and the app says live mode is off. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |
| `COMPOSIO_API_KEY` | Optional. Reads each toolkit's managed-auth status from Composio's API. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Keeps live guides and share links across deploys. Without them guides go to a temp folder and may vanish on redeploy (the page says so). |
| `GENERATION_LIMIT_PER_HOUR` | Optional. Per-address cap on live guides, default 6. |

No key is ever sent to the browser or committed. `.env*` is git-ignored.

### Commands

```bash
npm test                          # 27 tests, no network, no API key needed
npm run typecheck
npm run validate                  # seed guides: every ref, source and label is consistent
npm run smoke -- "QuickBooks"     # real end-to-end run of the live pipeline (needs ANTHROPIC_API_KEY)
npm run verify-seeds              # the verifier agent re-reads every page a seed cites (add --write to record)
npm run sync:composio             # look up managed-auth status for the seeds (needs COMPOSIO_API_KEY)
npm run build && npm start
```

### Deploy to Vercel

1. Import the repo. Framework is detected as Next.js.
2. Add `ANTHROPIC_API_KEY`. Add the Upstash Redis integration (it sets the `UPSTASH_REDIS_REST_*` variables) so share links survive deploys. Add `COMPOSIO_API_KEY` if you have one.
3. The generate route sets `maxDuration = 300`. Confirm your Vercel plan allows a function that long; if it does not, lower it and expect live runs on slow providers to be cut off.

## How the live agent works

```
query ─► research ─► draft ─► lint ─► verify ─► Composio lookup ─► save + share link
         search +    strict   code    second     managed-auth
         read pages  tool     rules   agent      status
```

1. **Research.** Claude uses web search and a page-reader tool (up to 18 turns, 14 pages) and submits notes: facts each page states, and what each page does not say.
2. **Draft.** A strict tool call produces the guide as structured data with a claim list. Steps and limits cite claim ids.
3. **Lint (code, not model).** A claim cannot be "official" unless it cites a page that was actually read. Dangling refs and non-https links are removed.
4. **Verify.** A separate agent re-reads each cited page and judges every claim that cites it. Unsupported claims are demoted to unverified and listed as corrections.
5. **Save.** The guide gets a share link. A run that read no page fails loudly rather than writing a guess.

Progress streams to the page, so you can watch which sites were read and which could not be.

More in [docs/decisions.md](docs/decisions.md), including how the Composio toolkit directory is used.

## Limitations

- **Nothing here is hand-tested.** Guides are researched from provider pages. Provider rules change; every guide shows its research date and links its sources.
- **Seed claims are marked "not re-checked"** until `npm run verify-seeds` is run with an API key.
- **The live path has been tested end to end only against a scripted model**, because the build environment had no API key. Run `npm run smoke` with a key before demoing.
- **Browser-rendered docs are unreadable** to the fetcher (Intuit's, for one) and count as no source. Such guides lean on secondary sources or say "unverified".
- **Quality depends on what the web search finds.** For obscure apps expect more "inferred" and "unverified" labels and shorter guides. That is the intended behaviour.
- **The fetcher resolves a hostname to check it is public, then fetches.** A hostile DNS server could answer differently the second time. For a public demo behind a rate limit this is an accepted gap; a production version would pin the resolved address.
- **The rate limit is per server instance** and in memory. It is a brake, not a wall.
- **Effort estimates are inferred.** No provider publishes "hours of developer time", so those figures are labelled *inferred*.
- **Not legal or compliance advice.**

## Layout

```
src/lib/schema.ts      the guide format and the grade and evidence vocabulary
src/lib/pipeline.ts    research, draft, lint, verify
src/lib/fetch-page.ts  safe page reader
src/lib/composio.ts    managed-auth lookup
src/lib/storage.ts     Redis or file storage, seeds first
src/lib/integrity.ts   consistency checks on any guide
src/app/               pages and the streaming /api/generate route
data/guides/*.json     the six researched guides
tests/                 27 tests, scripted model, no network
docs/                  decisions and verification log
```
