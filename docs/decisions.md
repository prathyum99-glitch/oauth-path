# Key decisions

## 1. The unit of trust is the claim, not the guide

Every guide is a list of small, checkable claims. Each claim carries an evidence label (official, secondary, inferred, unverified), the URLs behind it, and a check status from a second agent. Steps, limits and blockers point at claim ids, so a reader can click from "100 users" to the sentence on Google's page that says it. A guide that reads well but cannot show its sources is the biggest risk in a live demo, so the design makes the sources impossible to skip.

## 2. Code enforces honesty, not the prompt

The model cannot label a claim stronger than its sources allow. After drafting, deterministic code:

- demotes "official" or "secondary" claims that cite no page the agent actually read;
- makes a claim "secondary" if only non-official pages were read;
- removes references to claims that do not exist, and non-https links;
- turns a wait time with numbers but no basis into "inferred".

An independent verifier agent then re-reads each cited page against the claims. Anything the page does not support is demoted to unverified and shown under "Learned while checking". Nothing is called "tested" unless a person ran the setup (`handsOn.tested`, false for every guide today).

## 3. "Unknown" is a valid answer

Many providers publish no review time. The guide says "No review time published" rather than inventing one. Google's own two numbers disagree, so the guide shows the longer one and says why.

## 4. Who does what is a first-class field

The brief asks where an agent can act and where a person must take over. Every step is tagged agent, you, or both, and each guide has a two-column split: what the agent can do, and what only the account owner can do (sign in, prove domain ownership, record a video, submit, answer reviewers).

## 5. A grade scale built around the developer's real question

Easy (self-serve, and the pages read describe no approval step; that is an absence in those pages, not a promise), Moderate (self-serve to start, review or conditions to go public), Hard (formal review, documents or a security assessment), Gated (the provider decides whether you get access at all, and the timeline is not yours). Colour carries the grade, but so do the filled-segment count and the word, so it reads without colour.

## 6. How the Composio toolkit directory is used

The directory at docs.composio.dev/toolkits lists 1,694 toolkits by name and slug, each with two unlabeled numbers. The numbers carry no authentication data, and nothing on the page says what they count (likely tools and triggers; unconfirmed).

- **Used:** as the catalog for the "100 apps" library, giving the names and slugs to work through.
- **Used:** the toolkit API's `composio_managed_auth_schemes` field says whether Composio already provides the OAuth app, which changes the advice from "register an app" to "you can skip this until you need your own". `src/lib/composio.ts` reads it, and `npm run sync:composio` fills the seed guides.
- **Not used:** the two numbers as a proxy for difficulty or priority. A toolkit with many tools is not harder to approve.
- **Open question for Composio:** what the two numbers mean, and whether a per-toolkit "needs approval" signal exists internally.

## 7. Live generation is a pipeline, not one prompt

Research (search plus fetch, up to 18 turns and 14 page reads) → draft (strict tool) → deterministic lint → independent verification → Composio lookup → save. Each stage streams to the page so a viewer can see which sites were read and which were not. A run that reads no page at all fails with a clear message instead of writing a guess.

## 8. Safe by default for a public demo

- Page fetching is https only, public addresses only, manual redirects re-checked at each hop, size and time capped. Pages that only render in a browser count as unreadable.
- Live generation needs an API key; without one the endpoint answers 503 and the seeded guides keep working.
- Per-address hourly limit (best effort, in memory), 120 character query cap.
- No credentials are stored or requested anywhere. `.env.example` lists names only.
- Links in guides render only if they are https.

## What I did not build

A background job to keep 100 guides fresh, a diff view between guide versions, and user accounts. For a library of 100, the next step is running `verify-seeds` on a schedule and flagging claims whose source page changed.
