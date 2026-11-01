import { z } from 'zod';

/**
 * Evidence labels. They describe how a claim is supported, not how confident the model feels.
 *  official   - an official provider page (docs, help center, policy) says it
 *  secondary  - only third-party or community sources say it
 *  inferred   - a reasonable estimate or conclusion no source states directly
 *  unverified - no usable source, or a source check failed
 * Nothing is labelled "tested" unless a person actually ran the setup (see handsOn).
 */
export const Evidence = z.enum(['official', 'secondary', 'inferred', 'unverified']);
export type Evidence = z.infer<typeof Evidence>;

export const Difficulty = z.enum(['easy', 'moderate', 'hard', 'gated']);
export type Difficulty = z.infer<typeof Difficulty>;

export const Who = z.enum(['agent', 'you', 'both']);
export type Who = z.infer<typeof Who>;

const Refs = z.array(z.string());

export const ClaimDraft = z.object({
  id: z.string().describe('Short id such as c1, c2'),
  text: z.string().describe('One checkable statement in plain words'),
  evidence: Evidence,
  sources: z
    .array(z.string())
    .describe('URLs from the research notes that support the claim. Empty only for inferred or unverified claims.'),
});

/** What the drafting agent produces. Everything else on a Guide is added by code. */
export const DraftSchema = z.object({
  app: z.object({
    name: z.string(),
    website: z.string(),
    category: z.string().describe('Short category such as Messaging, CRM, Accounting'),
  }),
  summary: z.string().describe('Two or three plain sentences a non-expert can follow'),
  verdict: z.object({
    difficulty: Difficulty,
    headline: z.string().describe('One sentence: how hard this is and why'),
    effort: z.object({
      label: z.string().describe('Developer hands-on time, e.g. "30-60 min"'),
      minHours: z.number().nullable(),
      maxHours: z.number().nullable(),
    }),
    wait: z.object({
      label: z.string().describe('Provider review wait, e.g. "About 10 business days", or "None published"'),
      minDays: z.number().nullable().describe('Calendar days. Business days x 1.4. Null when unknown.'),
      maxDays: z.number().nullable(),
      basis: z.enum(['official', 'secondary', 'inferred', 'none']),
    }),
    refs: Refs,
  }),
  prerequisites: z.array(z.object({ item: z.string(), detail: z.string(), refs: Refs })),
  steps: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      who: Who,
      link: z.string().nullable().describe('Official URL for this step, or null'),
      refs: Refs,
    }),
  ),
  limits: z.array(z.object({ title: z.string(), detail: z.string(), refs: Refs })),
  blockers: z.array(
    z.object({ problem: z.string(), why: z.string(), nextMove: z.string(), refs: Refs }),
  ),
  handoff: z.object({
    agentCanDo: z.array(z.string()),
    youMustDo: z.array(z.string()),
  }),
  uncertainties: z.array(z.string()).describe('Things the research could not confirm'),
  claims: z.array(ClaimDraft),
});
export type Draft = z.infer<typeof DraftSchema>;

export const CheckStatus = z.enum(['supported', 'partial', 'unsupported', 'unreachable', 'not_checked']);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const SourceKind = z.enum(['official', 'secondary']);

export const GuideSchema = DraftSchema.extend({
  slug: z.string(),
  origin: z.enum(['seed', 'live']),
  model: z.string().nullable(),
  generatedAt: z.string(),
  researchedOn: z.string(),
  claims: z.array(
    ClaimDraft.extend({
      check: z.object({ status: CheckStatus, note: z.string() }),
    }),
  ),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      kind: SourceKind,
      status: z.enum(['read', 'unreachable', 'not_read']),
      note: z.string(),
    }),
  ),
  composio: z.object({
    managedAuth: z.enum(['yes', 'no', 'unknown']),
    source: z.enum(['api', 'docs', 'none']),
    note: z.string(),
  }),
  handsOn: z.object({ tested: z.boolean(), note: z.string() }),
  corrections: z.array(z.object({ was: z.string(), now: z.string(), why: z.string() })),
});
export type Guide = z.infer<typeof GuideSchema>;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'app';
}

const UNSUPPORTED_KEYS = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'pattern',
  'format',
  'default',
  'multipleOf',
  'uniqueItems',
  'examples',
]);

/** JSON Schema for a strict tool: zod output with the keywords strict mode rejects removed. */
export function toToolSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (UNSUPPORTED_KEYS.has(k)) continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(raw) as Record<string, unknown>;
}

export const EVIDENCE_COPY: Record<Evidence, { label: string; blurb: string }> = {
  official: { label: 'Official', blurb: 'An official provider page states this.' },
  secondary: { label: 'Secondary', blurb: 'Only third-party or community sources state this.' },
  inferred: { label: 'Inferred', blurb: 'An estimate or conclusion no source states directly.' },
  unverified: { label: 'Unverified', blurb: 'No usable source, or a source check did not support it.' },
};

export const DIFFICULTY_COPY: Record<Difficulty, { label: string; ticks: number; blurb: string }> = {
  easy: { label: 'Easy', ticks: 1, blurb: 'Self-serve. The pages read describe no approval step; check what is still unconfirmed below.' },
  moderate: { label: 'Moderate', ticks: 2, blurb: 'Self-serve to start. Going public adds a review or conditions.' },
  hard: { label: 'Hard', ticks: 3, blurb: 'Formal review, extra documents, or a security assessment. Plan in weeks.' },
  gated: { label: 'Gated', ticks: 4, blurb: 'Access depends on the provider approving you. Timeline is not in your hands.' },
};
