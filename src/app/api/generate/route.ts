import { createLlm, hasApiKey, modelName } from '@/lib/llm';
import { PipelineError, runPipeline, type PipelineEvent } from '@/lib/pipeline';
import { liveSlugFor, persistenceMode, saveLiveGuide } from '@/lib/storage';
import { guideProblems } from '@/lib/integrity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_QUERY = 120;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

/** Best-effort per-IP limit. Instances do not share memory, so this is a brake, not a wall. */
function overLimit(ip: string): boolean {
  const limit = Number(process.env.GENERATION_LIMIT_PER_HOUR ?? 6);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

export type StreamMessage = PipelineEvent | { type: 'done'; slug: string } | { type: 'error'; message: string };

export async function POST(req: Request): Promise<Response> {
  let query = '';
  try {
    const body = (await req.json()) as { query?: unknown };
    query = typeof body.query === 'string' ? body.query.trim().replace(/\s+/g, ' ') : '';
  } catch {
    return Response.json({ error: 'Send JSON like {"query":"Slack"}.' }, { status: 400 });
  }
  if (query.length < 2) return Response.json({ error: 'Enter an app name or website.' }, { status: 400 });
  if (query.length > MAX_QUERY) {
    return Response.json({ error: `Keep it under ${MAX_QUERY} characters: an app name or a website address.` }, { status: 400 });
  }
  if (!hasApiKey()) {
    return Response.json(
      { error: 'Live generation is switched off on this deployment because no ANTHROPIC_API_KEY is set. The seeded guides still work.' },
      { status: 503 },
    );
  }
  if (overLimit(clientIp(req))) {
    return Response.json(
      { error: 'That is the hourly limit of live guides from this address. Try again later, or open an existing guide.' },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (m: StreamMessage) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
        } catch {
          closed = true;
        }
      };
      req.signal.addEventListener('abort', () => {
        closed = true;
      });

      try {
        const guide = await runPipeline(query, { llm: createLlm(), model: modelName(), emit: send });
        guide.slug = liveSlugFor(guide.slug);
        const problems = guideProblems(guide);
        if (problems.length) {
          send({ type: 'warn', message: `Internal consistency notes: ${problems.slice(0, 3).join('; ')}` });
        }
        await saveLiveGuide(guide);
        if (persistenceMode() === 'file') {
          send({ type: 'warn', message: 'No database is configured, so this share link may stop working after a redeploy.' });
        }
        send({ type: 'done', slug: guide.slug });
      } catch (err) {
        const message =
          err instanceof PipelineError
            ? err.message
            : 'The agent hit an error before it could finish this guide. Try again, or use the app\'s developer docs URL.';
        if (!(err instanceof PipelineError)) console.error('generate failed', err);
        send({ type: 'error', message });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
