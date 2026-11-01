import type Anthropic from '@anthropic-ai/sdk';
import type { Llm, CreateParams } from '../src/lib/llm';
import type { PageResult } from '../src/lib/fetch-page';

export function message(content: unknown[], stop_reason: Anthropic.Message['stop_reason'] = 'tool_use'): Anthropic.Message {
  return { id: 'msg_test', type: 'message', role: 'assistant', model: 'test', content, stop_reason, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Anthropic.Message;
}

let n = 0;
export function toolUse(name: string, input: unknown) {
  return { type: 'tool_use', id: `tu_${++n}`, name, input };
}

export function fakeLlm(handler: (p: CreateParams, call: number) => Anthropic.Message | Promise<Anthropic.Message>): Llm & { calls: CreateParams[] } {
  const calls: CreateParams[] = [];
  return {
    calls,
    async create(params: CreateParams) {
      calls.push(params);
      return handler(params, calls.length);
    },
  };
}

export function toolNames(p: CreateParams): string[] {
  return (p.tools ?? []).map((t) => ('name' in t ? t.name : ''));
}

export function page(url: string, text: string, ok = true): PageResult {
  return { url, finalUrl: url, status: ok ? 200 : 500, ok, title: 'Test page', text, truncated: false, ...(ok ? {} : { error: 'HTTP 500' }) };
}

export const LONG_TEXT = 'Developers must submit the app for review before other people can use it. '.repeat(10);

export function draftInput(over: Record<string, unknown> = {}) {
  return {
    app: { name: 'Acme CRM', website: 'https://acme.example.com', category: 'CRM' },
    summary: 'Acme reviews every public app.',
    verdict: {
      difficulty: 'moderate',
      headline: 'Self-serve to start, review to go public.',
      effort: { label: '2 to 4 hours', minHours: 2, maxHours: 4 },
      wait: { label: 'About 5 business days', minDays: 7, maxDays: 7, basis: 'official' },
      refs: ['c1'],
    },
    prerequisites: [{ item: 'A privacy policy', detail: 'Linked from the app.', refs: ['c1'] }],
    steps: [
      { title: 'Register the app', detail: 'Create it in the console.', who: 'you', link: 'http://insecure.example.com/x', refs: ['c1'] },
      { title: 'Submit for review', detail: 'Use the form.', who: 'both', link: null, refs: ['c1', 'c9'] },
    ],
    limits: [{ title: 'Review required', detail: 'For public apps.', refs: ['c1'] }],
    blockers: [{ problem: 'Review stalls', why: 'Reviewers ask questions.', nextMove: 'Answer fast.', refs: ['c2'] }],
    handoff: { agentCanDo: ['Draft the submission text'], youMustDo: ['Click submit'] },
    uncertainties: [],
    claims: [
      { id: 'c1', text: 'Public apps must be reviewed.', evidence: 'official', sources: ['https://docs.acme.example.com/oauth'] },
      { id: 'c2', text: 'Reviews take 5 business days.', evidence: 'official', sources: ['https://docs.acme.example.com/oauth'] },
      { id: 'c3', text: 'Acme bans all bots.', evidence: 'official', sources: ['https://never-opened.example.com/page'] },
    ],
    ...over,
  };
}
