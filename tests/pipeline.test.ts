import test from 'node:test';
import assert from 'node:assert/strict';
import { PageCache } from '../src/lib/fetch-page';
import { PipelineError, callForJson, lintDraft, runPipeline, verifyClaims, type PipelineEvent } from '../src/lib/pipeline';
import { DraftSchema, type Guide } from '../src/lib/schema';
import { LONG_TEXT, draftInput, fakeLlm, message, page, toolNames, toolUse } from './helpers';
import { z } from 'zod';

const DOCS = 'https://docs.acme.example.com/oauth';
const composio: Guide['composio'] = { managedAuth: 'no', source: 'api', note: 'test' };

/** A scripted model: researches one page, drafts, then judges c1 supported and c2 unsupported. */
function scripted() {
  return fakeLlm((p) => {
    const names = toolNames(p);
    if (names.includes('fetch_page')) {
      const sawPage = JSON.stringify(p.messages).includes('tool_result');
      return sawPage
        ? message([
            toolUse('submit_research', {
              app: { name: 'Acme CRM', website: 'https://acme.example.com' },
              sources: [{ url: DOCS, title: 'Acme OAuth docs', kind: 'official', facts: ['Apps are reviewed'], notStated: ['timeline'] }],
              gaps: [],
            }),
          ])
        : message([toolUse('fetch_page', { url: DOCS })]);
    }
    if (names.includes('submit_guide')) return message([toolUse('submit_guide', draftInput())]);
    if (names.includes('submit_checks')) {
      return message([
        toolUse('submit_checks', {
          checks: [
            { claimId: 'c1', status: 'supported', note: 'Page says apps are reviewed.' },
            { claimId: 'c2', status: 'unsupported', note: 'The page gives no timeline.' },
          ],
        }),
      ]);
    }
    throw new Error(`unexpected call with tools ${names.join(',')}`);
  });
}

test('runPipeline: research, draft, verify, and the guide comes out honest', async () => {
  const events: PipelineEvent[] = [];
  const llm = scripted();
  const guide = await runPipeline('Acme CRM', {
    llm,
    model: 'test-model',
    emit: (e) => events.push(e),
    fetchPage: async (u) => page(u, LONG_TEXT),
    composio: async () => composio,
    now: () => new Date('2026-11-01T10:00:00Z'),
  });

  assert.equal(guide.origin, 'live');
  assert.equal(guide.slug, 'acme-crm');
  assert.equal(guide.model, 'test-model');
  assert.equal(guide.researchedOn, '2026-11-01');
  assert.equal(guide.handsOn.tested, false);
  assert.deepEqual(guide.composio, composio);

  const byId = Object.fromEntries(guide.claims.map((c) => [c.id, c]));
  assert.equal(byId.c1.check.status, 'supported');
  assert.equal(byId.c1.evidence, 'official');
  // c2 was labelled official but its page did not support it, so it is demoted and shown as a correction.
  assert.equal(byId.c2.check.status, 'unsupported');
  assert.equal(byId.c2.evidence, 'unverified');
  assert.ok(guide.corrections.some((c) => c.was.includes('Reviews take 5 business days')));
  // c3 cited a page nobody opened, so lint demoted it before verification.
  assert.equal(byId.c3.evidence, 'unverified');
  assert.deepEqual(byId.c3.sources, []);
  // A dangling ref (c9) and an http:// link were cleaned.
  assert.deepEqual(guide.steps[1].refs, ['c1']);
  assert.equal(guide.steps[0].link, null);
  // The wait is only "official" while an official claim backs it. c2 was demoted but lint ran first, so it stays official here.
  assert.ok(['official', 'inferred'].includes(guide.verdict.wait.basis));

  assert.deepEqual(events.filter((e) => e.type === 'stage').map((e) => (e as { stage: string }).stage), ['research', 'draft', 'verify', 'finish']);
  assert.ok(events.some((e) => e.type === 'source' && e.ok));
  assert.equal(events.filter((e) => e.type === 'check').length, 3);
});

test('runPipeline refuses to write a guide when no page could be read', async () => {
  const llm = fakeLlm((p) => {
    const names = toolNames(p);
    if (JSON.stringify(p.messages).includes('tool_result')) {
      return message([toolUse('submit_research', { app: { name: 'Ghost', website: 'https://ghost.example.com' }, sources: [{ url: DOCS, title: 'Docs', kind: 'official', facts: [], notStated: [] }], gaps: ['nothing readable'] })]);
    }
    assert.ok(names.includes('fetch_page'));
    return message([toolUse('fetch_page', { url: DOCS })]);
  });
  await assert.rejects(
    runPipeline('Ghost', { llm, model: 'm', emit: () => {}, fetchPage: async (u) => page(u, '', false), composio: async () => composio }),
    (e: unknown) => e instanceof PipelineError && /guesswork/.test(e.message),
  );
});

test('runPipeline gives up cleanly when research never submits', async () => {
  const llm = fakeLlm(() => message([{ type: 'text', text: 'Let me think.' }], 'end_turn'));
  await assert.rejects(runPipeline('x', { llm, model: 'm', emit: () => {}, composio: async () => composio }), PipelineError);
  assert.ok(llm.calls.length <= 4, 'nudges are capped');
});

test('research resends the turn on pause_turn and survives a strict-mode 400', async () => {
  let first = true;
  const llm = fakeLlm((p) => {
    if (first) {
      first = false;
      throw Object.assign(new Error('bad'), { status: 400 });
    }
    if (JSON.stringify(p.messages).includes('"server_tool_use"')) {
      return message([toolUse('submit_research', { app: { name: 'A', website: 'https://a.example.com' }, sources: [], gaps: [] })]);
    }
    return message([{ type: 'server_tool_use', id: 'st1', name: 'web_search', input: { query: 'a oauth' } }], 'pause_turn');
  });
  const events: PipelineEvent[] = [];
  await assert.rejects(runPipeline('A', { llm, model: 'm', emit: (e) => events.push(e), composio: async () => composio }), /guesswork/);
  assert.ok(events.some((e) => e.type === 'search' && e.query === 'a oauth'));
  const firstTools = JSON.stringify(llm.calls[0].tools);
  const retryTools = JSON.stringify(llm.calls[1].tools);
  assert.ok(firstTools.includes('"strict":true'));
  assert.ok(!retryTools.includes('"strict":true'));
});

test('callForJson falls back to a plain tool on a 400 and repairs invalid output', async () => {
  const S = z.object({ n: z.number() });
  let call = 0;
  const llm = fakeLlm((p) => {
    call++;
    if (call === 1) throw Object.assign(new Error('strict not allowed'), { status: 400 });
    if (call === 2) return message([toolUse('t', { n: 'nope' })]);
    return message([toolUse('t', { n: 7 })]);
  });
  const out = await callForJson(llm, 'm', { system: 's', toolName: 't', toolDescription: 'd', schema: S, user: 'u', maxTokens: 100 });
  assert.deepEqual(out, { n: 7 });
  assert.ok(JSON.stringify(llm.calls[0].tools).includes('"strict":true'));
  assert.ok(!JSON.stringify(llm.calls[1].tools).includes('"strict":true'));
  const repair = JSON.stringify(llm.calls[2].messages);
  assert.match(repair, /Invalid\. Fix this/);
});

test('callForJson stops after three bad attempts and surfaces max_tokens', async () => {
  const S = z.object({ n: z.number() });
  const bad = fakeLlm(() => message([toolUse('t', { n: 'x' })]));
  await assert.rejects(callForJson(bad, 'm', { system: 's', toolName: 't', toolDescription: 'd', schema: S, user: 'u', maxTokens: 10 }), PipelineError);
  assert.equal(bad.calls.length, 3);
  const cut = fakeLlm(() => message([], 'max_tokens'));
  await assert.rejects(callForJson(cut, 'm', { system: 's', toolName: 't', toolDescription: 'd', schema: S, user: 'u', maxTokens: 10 }), /ran out of room/);
});

test('lintDraft: official needs a page that was read, and secondary pages cannot make a claim official', () => {
  const sources: Guide['sources'] = [
    { url: DOCS, title: 'Docs', kind: 'official', status: 'read', note: '' },
    { url: 'https://blog.example.com/post', title: 'Blog', kind: 'secondary', status: 'read', note: '' },
    { url: 'https://broken.example.com/', title: 'Broken', kind: 'official', status: 'unreachable', note: '' },
  ];
  const draft = DraftSchema.parse(
    draftInput({
      claims: [
        { id: 'a', text: 'a', evidence: 'official', sources: [DOCS] },
        { id: 'b', text: 'b', evidence: 'official', sources: ['https://blog.example.com/post'] },
        { id: 'c', text: 'c', evidence: 'official', sources: ['https://broken.example.com/'] },
        { id: 'a', text: 'dup id', evidence: 'inferred', sources: [] },
      ],
      verdict: { ...draftInput().verdict, refs: ['a', 'zzz'], wait: { label: 'x', minDays: 3, maxDays: 5, basis: 'none' } },
    }),
  );
  const { draft: out, notes } = lintDraft(draft, sources);
  const ev = Object.fromEntries(out.claims.map((c) => [c.id, c.evidence]));
  assert.equal(ev.a, 'official');
  assert.equal(ev.b, 'secondary');
  assert.equal(ev.c, 'unverified');
  assert.equal(new Set(out.claims.map((c) => c.id)).size, 4, 'duplicate ids made unique');
  assert.deepEqual(out.verdict.refs, ['a']);
  assert.equal(out.verdict.wait.basis, 'inferred', 'numbers with no basis cannot stay "none"');
  assert.ok(notes.length >= 2);
});

test('verifyClaims: unreachable when the page is not cached, and best status wins across pages', async () => {
  const cache = new PageCache();
  cache.set('https://one.example.com/', page('https://one.example.com/', LONG_TEXT));
  cache.set('https://two.example.com/', page('https://two.example.com/', LONG_TEXT));
  const llm = fakeLlm((p) => {
    const user = JSON.stringify(p.messages);
    const status = user.includes('one.example.com') ? 'unsupported' : 'supported';
    return message([toolUse('submit_checks', { checks: [{ claimId: 'x', status, note: `from ${status}` }] })]);
  });
  const claims = [
    { id: 'x', text: 'x claim', evidence: 'official' as const, sources: ['https://one.example.com/', 'https://two.example.com/'] },
    { id: 'y', text: 'y claim', evidence: 'official' as const, sources: ['https://gone.example.com/'] },
    { id: 'z', text: 'z claim', evidence: 'inferred' as const, sources: [] },
  ];
  const out = await verifyClaims(claims, cache, { llm, model: 'm', emit: () => {} });
  const by = Object.fromEntries(out.claims.map((c) => [c.id, c]));
  assert.equal(by.x.check.status, 'supported');
  assert.equal(by.x.evidence, 'official');
  assert.equal(by.y.check.status, 'unreachable');
  assert.equal(by.z.check.status, 'not_checked');
  assert.equal(out.corrections.length, 0);
});
