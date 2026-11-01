import test from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { withCacheBreakpoint } from '../src/lib/pipeline';

type Msgs = Anthropic.MessageParam[];

function marked(m: Anthropic.MessageParam): number {
  return JSON.stringify(m).split('cache_control').length - 1;
}

test('a cache marker goes on the last block of the last user message, on a copy', () => {
  const original: Msgs = [
    { role: 'user', content: 'Find out about Acme' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'fetch_page', input: { url: 'https://a.example.com' } }] },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'page one' },
        { type: 'tool_result', tool_use_id: 't2', content: 'page two' },
      ],
    },
  ];
  const before = JSON.stringify(original);
  const out = withCacheBreakpoint(original);

  assert.equal(JSON.stringify(original), before, 'the stored conversation is not changed');
  assert.equal(out.length, original.length);
  assert.equal(marked(out[0]), 0);
  assert.equal(marked(out[1]), 0);
  const blocks = out[2].content as Anthropic.ContentBlockParam[];
  assert.equal(marked(out[2]), 1);
  assert.ok('cache_control' in blocks[1], 'the last block carries the marker');
  assert.ok(!('cache_control' in blocks[0]), 'earlier blocks do not');
});

test('a plain-text last message becomes one marked text block', () => {
  const out = withCacheBreakpoint([{ role: 'user', content: 'Call submit_research now.' }]);
  assert.deepEqual(out[0].content, [{ type: 'text', text: 'Call submit_research now.', cache_control: { type: 'ephemeral' } }]);
});

test('repeated turns never stack more than one marker', () => {
  let convo: Msgs = [{ role: 'user', content: 'start' }];
  for (let i = 0; i < 6; i++) {
    const sent = withCacheBreakpoint(convo);
    assert.equal(sent.reduce((n, m) => n + marked(m), 0), 1);
    convo = [
      ...convo,
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'x' }] },
    ];
  }
});

test('nothing is marked when the conversation ends on the assistant', () => {
  const convo: Msgs = [
    { role: 'user', content: 'start' },
    { role: 'assistant', content: [{ type: 'text', text: 'working' }] },
  ];
  const out = withCacheBreakpoint(convo);
  assert.equal(out, convo);
  assert.equal(out.reduce((n, m) => n + marked(m), 0), 0);
});

// The run must survive an API that rejects the cache marker, and must send the marker when it is accepted.
import { runPipeline } from '../src/lib/pipeline';
import { LONG_TEXT, draftInput, fakeLlm, message, page, toolNames, toolUse } from './helpers';

const DOCS = 'https://docs.acme.example.com/oauth';

function modelThat(rejectMarker: boolean) {
  return fakeLlm((p) => {
    const names = toolNames(p);
    const text = JSON.stringify(p.messages);
    if (names.includes('fetch_page')) {
      if (rejectMarker && text.includes('cache_control')) throw Object.assign(new Error('cache_control not allowed here'), { status: 400 });
      return text.includes('tool_result')
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
    return message([
      toolUse('submit_checks', {
        checks: [
          { claimId: 'c1', status: 'supported', note: 'ok' },
          { claimId: 'c2', status: 'supported', note: 'ok' },
        ],
      }),
    ]);
  });
}

const deps = (llm: ReturnType<typeof modelThat>) => ({
  llm,
  model: 'test-model',
  emit: () => {},
  fetchPage: async (u: string) => page(u, LONG_TEXT),
  composio: async () => ({ managedAuth: 'no' as const, source: 'api' as const, note: 'test' }),
  now: () => new Date('2026-11-01T10:00:00Z'),
});

test('research turns carry the cache marker', async () => {
  const llm = modelThat(false);
  await runPipeline('Acme CRM', deps(llm));
  const research = llm.calls.filter((c) => toolNames(c).includes('fetch_page'));
  assert.ok(research.length >= 2);
  for (const c of research) assert.equal(JSON.stringify(c.messages).split('cache_control').length - 1, 1);
  // Only the research loop is marked: the draft and the checks are single calls.
  for (const c of llm.calls.filter((c) => !toolNames(c).includes('fetch_page'))) assert.ok(!JSON.stringify(c.messages).includes('cache_control'));
});

test('a rejected cache marker falls back to plain requests and the guide is still written', async () => {
  const llm = modelThat(true);
  const guide = await runPipeline('Acme CRM', deps(llm));
  assert.equal(guide.slug, 'acme-crm');
  const research = llm.calls.filter((c) => toolNames(c).includes('fetch_page'));
  assert.ok(!JSON.stringify(research[research.length - 1].messages).includes('cache_control'));
});
