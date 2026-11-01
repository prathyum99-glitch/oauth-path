import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  DraftSchema,
  GuideSchema,
  SourceKind,
  slugify,
  toToolSchema,
  type CheckStatus,
  type Draft,
  type Evidence,
  type Guide,
} from './schema';
import { PageCache, fetchPage as realFetchPage, type PageResult } from './fetch-page';
import type { Llm } from './llm';
import { DRAFT_SYSTEM, RESEARCH_SYSTEM, VERIFY_SYSTEM } from './prompts';
import { lookupComposio } from './composio';

export class PipelineError extends Error {}

export type PipelineEvent =
  | { type: 'stage'; stage: 'research' | 'draft' | 'verify' | 'finish'; message: string }
  | { type: 'search'; query: string }
  | { type: 'source'; url: string; title: string; ok: boolean; note: string }
  | { type: 'check'; claimId: string; status: CheckStatus }
  | { type: 'warn'; message: string };

export type PipelineDeps = {
  llm: Llm;
  model: string;
  emit: (e: PipelineEvent) => void;
  fetchPage?: (url: string) => Promise<PageResult>;
  composio?: (appName: string) => Promise<Guide['composio']>;
  now?: () => Date;
};

type SourceRow = Guide['sources'][number];

const ResearchSchema = z.object({
  app: z.object({ name: z.string(), website: z.string() }),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      kind: SourceKind,
      facts: z.array(z.string()),
      notStated: z.array(z.string()),
    }),
  ),
  gaps: z.array(z.string()),
});
type Research = z.infer<typeof ResearchSchema>;

const CheckSchema = z.object({
  checks: z.array(
    z.object({
      claimId: z.string(),
      status: z.enum(['supported', 'partial', 'unsupported']),
      note: z.string(),
    }),
  ),
});

const MAX_RESEARCH_TURNS = 18;
const MAX_FETCHES = 14;
const PAGE_CHARS_TO_MODEL = 14_000;
const VERIFY_CONCURRENCY = 4;

const FETCH_TOOL: Anthropic.Tool = {
  name: 'fetch_page',
  description:
    'Fetch one public https web page and return its readable text. Use it to read a page you found. Pages that only render in a browser return an error.',
  input_schema: {
    type: 'object',
    properties: { url: { type: 'string', description: 'Full https URL' } },
    required: ['url'],
  },
};

function isBadRequest(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { status?: number }).status === 400;
}

function asParams(content: Anthropic.Message['content']): Anthropic.ContentBlockParam[] {
  return content as unknown as Anthropic.ContentBlockParam[];
}

/** Calls the model with one tool and returns schema-valid input. Strict mode first, plain tool if the API rejects the schema. */
export async function callForJson<S extends z.ZodType>(
  llm: Llm,
  model: string,
  o: { system: string; toolName: string; toolDescription: string; schema: S; user: string; maxTokens: number },
): Promise<z.infer<S>> {
  const tool = (strict: boolean): Anthropic.Tool => ({
    name: o.toolName,
    description: o.toolDescription,
    input_schema: toToolSchema(o.schema) as Anthropic.Tool.InputSchema,
    ...(strict ? { strict: true } : {}),
  });
  let strict = true;
  let lastIssue = '';
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.user }];

  for (let attempt = 0; attempt < 3; attempt++) {
    let resp: Anthropic.Message;
    try {
      resp = await llm.create({ model, max_tokens: o.maxTokens, system: o.system, tools: [tool(strict)], messages });
    } catch (e) {
      if (strict && isBadRequest(e)) {
        strict = false;
        attempt--;
        continue;
      }
      throw e;
    }
    if (resp.stop_reason === 'max_tokens') throw new PipelineError('The model ran out of room while writing. Try again.');
    const use = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === o.toolName);
    if (use) {
      const parsed = o.schema.safeParse(use.input);
      if (parsed.success) return parsed.data;
      lastIssue = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      messages.push(
        { role: 'assistant', content: asParams(resp.content) },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Invalid. Fix this and call ${o.toolName} again: ${lastIssue}` }],
        },
      );
    } else {
      messages.push(
        { role: 'assistant', content: asParams(resp.content) },
        { role: 'user', content: `Call ${o.toolName} now.` },
      );
    }
  }
  throw new PipelineError(`The model did not return a valid ${o.toolName} result${lastIssue ? ` (${lastIssue})` : ''}.`);
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function httpsOrNull(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

async function research(query: string, deps: PipelineDeps, cache: PageCache): Promise<Research> {
  const now = (deps.now ?? (() => new Date()))();
  const fetchImpl = deps.fetchPage ?? ((u: string) => realFetchPage(u));
  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
    FETCH_TOOL,
    {
      name: 'submit_research',
      description: 'Submit your research notes once you have read enough pages.',
      input_schema: toToolSchema(ResearchSchema) as Anthropic.Tool.InputSchema,
      strict: true,
    },
  ];
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Find out what it takes for a developer to get an OAuth app ready for production use with: ${query}\nToday is ${today(now)}. The input may be an app name or a website.`,
    },
  ];
  let fetches = 0;
  let nudges = 0;
  let strictTools = true;

  for (let turn = 0; turn < MAX_RESEARCH_TURNS; turn++) {
    let resp: Anthropic.Message;
    try {
      const toolList = strictTools
        ? tools
        : tools.map((t) => {
            if ('strict' in t) {
              const { strict: _s, ...rest } = t as Anthropic.Tool;
              return rest;
            }
            return t;
          });
      resp = await deps.llm.create({ model: deps.model, max_tokens: 8000, system: RESEARCH_SYSTEM, tools: toolList, messages });
    } catch (e) {
      if (strictTools && isBadRequest(e)) {
        strictTools = false;
        turn--;
        continue;
      }
      throw e;
    }

    for (const b of resp.content) {
      if (b.type === 'server_tool_use' && b.name === 'web_search') {
        const q = (b.input as { query?: string })?.query;
        if (q) deps.emit({ type: 'search', query: q });
      }
    }
    messages.push({ role: 'assistant', content: asParams(resp.content) });

    if (resp.stop_reason === 'pause_turn') continue;
    if (resp.stop_reason === 'max_tokens') throw new PipelineError('The research step ran out of room. Try again.');

    const uses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) {
      if (++nudges > 2) break;
      messages.push({ role: 'user', content: 'Call submit_research now with what you have found so far.' });
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      if (u.name === 'submit_research') {
        const parsed = ResearchSchema.safeParse(u.input);
        if (parsed.success) return parsed.data;
        const issues = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Invalid. Fix and call submit_research again: ${issues}` });
      } else if (u.name === 'fetch_page') {
        const url = String((u.input as { url?: unknown })?.url ?? '');
        if (fetches >= MAX_FETCHES) {
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Fetch limit reached. Call submit_research now.' });
          continue;
        }
        fetches++;
        const page = cache.get(url) ?? (await fetchImpl(url));
        cache.set(url, page);
        if (page.finalUrl && page.finalUrl !== url) cache.set(page.finalUrl, page);
        deps.emit({
          type: 'source',
          url,
          title: page.title || url,
          ok: page.ok,
          note: page.ok ? 'Read' : page.error ?? 'Could not be read',
        });
        results.push(
          page.ok
            ? {
                type: 'tool_result',
                tool_use_id: u.id,
                content: `Title: ${page.title}\nURL: ${page.finalUrl}\n\n${page.text.slice(0, PAGE_CHARS_TO_MODEL)}${page.text.length > PAGE_CHARS_TO_MODEL ? '\n[truncated]' : ''}`,
              }
            : { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Could not read this page: ${page.error ?? 'unknown error'}` },
        );
      } else {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Unknown tool ${u.name}` });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  throw new PipelineError("Research did not finish. Try again, or use the app's full name or website.");
}

function buildSources(r: Research, cache: PageCache): SourceRow[] {
  const seen = new Set<string>();
  const rows: SourceRow[] = [];
  for (const s of r.sources) {
    const url = httpsOrNull(s.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const page = cache.get(s.url) ?? cache.get(url);
    const status: SourceRow['status'] = page ? (page.ok ? 'read' : 'unreachable') : 'not_read';
    rows.push({
      url,
      title: s.title || url,
      kind: s.kind,
      status,
      note:
        status === 'read'
          ? 'Read in full by the research agent.'
          : status === 'unreachable'
            ? `Could not be read: ${page?.error ?? 'unknown error'}.`
            : 'Found in search but never opened, so it supports nothing here.',
    });
  }
  return rows;
}

/** Deterministic guardrails: the model cannot label a claim stronger than its sources allow. */
export function lintDraft(draft: Draft, sources: SourceRow[]): { draft: Draft; notes: string[] } {
  const notes: string[] = [];
  const byUrl = new Map(sources.map((s) => [s.url, s]));
  const ids = new Set<string>();

  const claims = draft.claims.map((c, i) => {
    let id = c.id.trim() || `c${i + 1}`;
    while (ids.has(id)) id = `${id}_${i}`;
    ids.add(id);
    const urls = [...new Set(c.sources.map((u) => httpsOrNull(u)).filter((u): u is string => !!u))];
    const read = urls.map((u) => byUrl.get(u)).filter((s): s is SourceRow => !!s && s.status === 'read');
    let evidence: Evidence = c.evidence;
    if (evidence === 'official' || evidence === 'secondary') {
      if (read.length === 0) {
        evidence = 'unverified';
        notes.push(`${id}: cited no page that was actually read, so it is unverified.`);
      } else {
        const hasOfficial = read.some((s) => s.kind === 'official');
        if (hasOfficial && evidence !== 'official') evidence = 'official';
        if (!hasOfficial && evidence === 'official') {
          evidence = 'secondary';
          notes.push(`${id}: no official page was read for it, so it is secondary.`);
        }
      }
    }
    return { ...c, id, evidence, sources: read.map((s) => s.url) };
  });

  const valid = new Set(claims.map((c) => c.id));
  const cleanRefs = (refs: string[]) => refs.filter((r) => valid.has(r));
  const verdict = { ...draft.verdict, refs: cleanRefs(draft.verdict.refs) };
  if ((verdict.wait.minDays !== null || verdict.wait.maxDays !== null) && verdict.wait.basis === 'none') {
    verdict.wait = { ...verdict.wait, basis: 'inferred' };
  }
  if (verdict.wait.basis === 'official' || verdict.wait.basis === 'secondary') {
    const supporting = claims.filter((c) => verdict.refs.includes(c.id) && c.evidence === verdict.wait.basis);
    if (supporting.length === 0) verdict.wait = { ...verdict.wait, basis: 'inferred' };
  }

  const out: Draft = {
    ...draft,
    app: { ...draft.app, website: httpsOrNull(draft.app.website) ?? '' },
    verdict,
    prerequisites: draft.prerequisites.map((p) => ({ ...p, refs: cleanRefs(p.refs) })),
    steps: draft.steps.map((s) => ({ ...s, link: httpsOrNull(s.link), refs: cleanRefs(s.refs) })),
    limits: draft.limits.map((l) => ({ ...l, refs: cleanRefs(l.refs) })),
    blockers: draft.blockers.map((b) => ({ ...b, refs: cleanRefs(b.refs) })),
    claims,
  };
  return { draft: out, notes };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const RANK: Record<'supported' | 'partial' | 'unsupported', number> = { supported: 2, partial: 1, unsupported: 0 };

type VerifyResult = {
  claims: Guide['claims'];
  corrections: Guide['corrections'];
  uncertainties: string[];
};

/** A separate agent re-reads each cited page and judges every claim that cites it. */
export async function verifyClaims(
  claims: Draft['claims'],
  cache: PageCache,
  deps: Pick<PipelineDeps, 'llm' | 'model' | 'emit'>,
): Promise<VerifyResult> {
  const byUrl = new Map<string, Draft['claims']>();
  for (const c of claims) for (const u of c.sources) byUrl.set(u, [...(byUrl.get(u) ?? []), c]);

  const verdicts = new Map<string, { status: 'supported' | 'partial' | 'unsupported'; note: string }>();
  await pool([...byUrl.entries()], VERIFY_CONCURRENCY, async ([url, cs]) => {
    const page = cache.get(url);
    if (!page?.ok) return;
    try {
      const out = await callForJson(deps.llm, deps.model, {
        system: VERIFY_SYSTEM,
        toolName: 'submit_checks',
        toolDescription: 'Submit one check per claim.',
        schema: CheckSchema,
        maxTokens: 3000,
        user: `PAGE URL: ${url}\n\nPAGE TEXT:\n${page.text}\n\nCLAIMS TO CHECK:\n${cs.map((c) => `- ${c.id}: ${c.text}`).join('\n')}`,
      });
      for (const ch of out.checks) {
        const prev = verdicts.get(ch.claimId);
        if (!prev || RANK[ch.status] > RANK[prev.status]) verdicts.set(ch.claimId, { status: ch.status, note: ch.note });
      }
    } catch (e) {
      deps.emit({ type: 'warn', message: `Could not check claims against ${url}: ${e instanceof Error ? e.message : 'error'}` });
    }
  });

  const corrections: Guide['corrections'] = [];
  const uncertainties: string[] = [];
  const checked: Guide['claims'] = claims.map((c) => {
    let status: CheckStatus;
    let note: string;
    let evidence = c.evidence;
    const v = verdicts.get(c.id);
    if (c.sources.length === 0) {
      status = 'not_checked';
      note = 'No source cited, so there was nothing to check against.';
    } else if (!v) {
      status = 'unreachable';
      note = 'The cited page could not be re-read for checking.';
    } else {
      status = v.status;
      note = v.note;
      if (v.status === 'unsupported') {
        corrections.push({
          was: `${c.text} (labelled ${c.evidence})`,
          now: 'Downgraded to unverified',
          why: `The cited page did not support it. ${v.note}`,
        });
        uncertainties.push(`Not confirmed by its cited page: ${c.text}`);
        evidence = 'unverified';
      } else if (v.status === 'partial') {
        uncertainties.push(`Only partly confirmed: ${c.text} (${v.note})`);
      }
    }
    deps.emit({ type: 'check', claimId: c.id, status });
    return { ...c, evidence, check: { status, note } };
  });
  return { claims: checked, corrections, uncertainties };
}

export async function runPipeline(query: string, deps: PipelineDeps): Promise<Guide> {
  const now = (deps.now ?? (() => new Date()))();
  const cache = new PageCache();

  deps.emit({ type: 'stage', stage: 'research', message: 'Finding and reading the provider\'s official pages' });
  const notes = await research(query, deps, cache);
  const sources = buildSources(notes, cache);
  const readCount = sources.filter((s) => s.status === 'read').length;
  if (readCount === 0) {
    throw new PipelineError(
      'No source page could be read for this app, so a guide would be guesswork. Try the full app name or its developer docs URL.',
    );
  }

  deps.emit({ type: 'stage', stage: 'draft', message: `Drafting the guide from ${readCount} page${readCount === 1 ? '' : 's'} read` });
  const rawDraft = await callForJson(deps.llm, deps.model, {
    system: DRAFT_SYSTEM,
    toolName: 'submit_guide',
    toolDescription: 'Submit the finished guide.',
    schema: DraftSchema,
    maxTokens: 12000,
    user: `Write the guide for: ${query}\nToday is ${today(now)}.\n\nRESEARCH NOTES (JSON). Sources with status other than "read" support nothing.\n${JSON.stringify({
      app: notes.app,
      gaps: notes.gaps,
      sources: notes.sources.map((s) => ({ ...s, status: sources.find((r) => r.url === httpsOrNull(s.url))?.status ?? 'not_read' })),
    })}`,
  });
  const { draft, notes: lintNotes } = lintDraft(rawDraft, sources);
  for (const n of lintNotes) deps.emit({ type: 'warn', message: n });

  deps.emit({ type: 'stage', stage: 'verify', message: 'A second agent is re-reading each cited page against the claims' });
  const verified = await verifyClaims(draft.claims, cache, deps);

  deps.emit({ type: 'stage', stage: 'finish', message: 'Finishing the guide' });
  const composio = await (deps.composio ?? ((n: string) => lookupComposio(n)))(draft.app.name);

  const guide = GuideSchema.parse({
    ...draft,
    claims: verified.claims,
    uncertainties: [...draft.uncertainties, ...lintNotes, ...verified.uncertainties],
    slug: slugify(draft.app.name),
    origin: 'live',
    model: deps.model,
    generatedAt: now.toISOString(),
    researchedOn: today(now),
    sources,
    composio,
    handsOn: { tested: false, note: 'Not tested hands-on. Nothing here was attempted in a real provider console.' },
    corrections: verified.corrections,
  });
  return guide;
}
