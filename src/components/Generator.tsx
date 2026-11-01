'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamMessage } from '@/app/api/generate/route';

type Stage = 'research' | 'draft' | 'verify' | 'finish';
const STAGES: Array<{ key: Stage; title: string }> = [
  { key: 'research', title: 'Read the provider\'s official pages' },
  { key: 'draft', title: 'Draft the guide from what was read' },
  { key: 'verify', title: 'Second agent re-reads each cited page' },
  { key: 'finish', title: 'Check Composio and save' },
];

type Feed = {
  stage: Stage | null;
  stageMessages: Partial<Record<Stage, string>>;
  searches: string[];
  sources: Array<{ url: string; title: string; ok: boolean; note: string }>;
  checks: Record<string, number>;
  warnings: string[];
};
const EMPTY: Feed = { stage: null, stageMessages: {}, searches: [], sources: [], checks: {}, warnings: [] };

const CODE_KEY = 'oauth-path-access-code';

export function Generator({ canGenerate, codeRequired }: { canGenerate: boolean; codeRequired: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [code, setCode] = useState('');
  // The code remembered from earlier in this tab. Only this one may start a run by itself, never one being typed.
  const [storedCode, setStoredCode] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<Feed>(EMPTY);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => () => abort.current?.abort(), []);

  // A code typed earlier in this tab is remembered for the tab only. Storage can be blocked, so the form works without it.
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(CODE_KEY);
      if (saved) {
        setCode(saved);
        setStoredCode(saved);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const apply = useCallback((m: StreamMessage) => {
    setFeed((f) => {
      switch (m.type) {
        case 'stage':
          return { ...f, stage: m.stage, stageMessages: { ...f.stageMessages, [m.stage]: m.message } };
        case 'search':
          return { ...f, searches: [...f.searches, m.query] };
        case 'source':
          return { ...f, sources: [...f.sources, { url: m.url, title: m.title, ok: m.ok, note: m.note }] };
        case 'check':
          return { ...f, checks: { ...f.checks, [m.claimId]: 1 } };
        case 'warn':
          return { ...f, warnings: [...f.warnings, m.message] };
        default:
          return f;
      }
    });
  }, []);

  const start = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (text.length < 2 || running) return;
      setRunning(true);
      setError(null);
      setFeed(EMPTY);
      setSeconds(0);
      const ctl = new AbortController();
      abort.current = ctl;
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text, ...(codeRequired ? { code: code.trim() } : {}) }),
          signal: ctl.signal,
        });
        if (res.status === 401) {
          try {
            window.sessionStorage.removeItem(CODE_KEY);
          } catch {
            /* storage unavailable */
          }
        }
        if (!res.ok || !res.body) {
          let msg = 'Could not start. Try again in a moment.';
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            /* keep default */
          }
          setError(msg);
          setRunning(false);
          return;
        }
        if (codeRequired) {
          try {
            window.sessionStorage.setItem(CODE_KEY, code.trim());
          } catch {
            /* storage unavailable */
          }
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let finished = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = block.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            let msg: StreamMessage;
            try {
              msg = JSON.parse(line.slice(6)) as StreamMessage;
            } catch {
              continue;
            }
            if (msg.type === 'done') {
              finished = true;
              router.push(`/g/${msg.slug}`);
              return;
            }
            if (msg.type === 'error') {
              finished = true;
              setError(msg.message);
              setRunning(false);
              return;
            }
            apply(msg);
          }
        }
        if (!finished) {
          setError('The connection closed before the guide was finished. Nothing was saved. Try again.');
          setRunning(false);
        }
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError('The connection dropped before the guide was finished. Nothing was saved. Try again.');
        setRunning(false);
      }
    },
    [apply, router, running, code, codeRequired],
  );

  // Only start by itself when the link says go=1 (the Investigate button). A plain /new?q=… just fills the box.
  useEffect(() => {
    if (started.current) return;
    if (params.get('go') === '1' && initial.trim().length >= 2 && canGenerate && (!codeRequired || (storedCode !== '' && code === storedCode))) {
      started.current = true;
      void start(initial);
    }
  }, [params, initial, canGenerate, codeRequired, code, storedCode, start]);

  const stageIndex = feed.stage ? STAGES.findIndex((s) => s.key === feed.stage) : -1;
  const checked = Object.keys(feed.checks).length;
  const mins = Math.floor(seconds / 60);

  return (
    <div className="gen">
      <form
        className="gen__form"
        onSubmit={(e) => {
          e.preventDefault();
          started.current = true;
          void start(query);
        }}
      >
        {codeRequired && (
          <div className="gen__code">
            <label htmlFor="gen-code" className="finder__label">Access code</label>
            <input
              id="gen-code"
              className="input"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={running}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="gen-code-help"
            />
            <p id="gen-code-help" className="muted small">
              The agent costs the site owner money, so it asks for a code. Ask the owner for it. The guides stay open to everyone.
            </p>
          </div>
        )}
        <label htmlFor="gen-q" className="finder__label">App name or website</label>
        <div className="gen__row">
          <input
            id="gen-q"
            className="input input--lg"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For example QuickBooks, or developer.intuit.com"
            disabled={running}
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn--primary btn--lg" type="submit" disabled={running || !canGenerate || query.trim().length < 2 || (codeRequired && code.trim() === '')}>
            {running ? 'Working…' : 'Investigate'}
          </button>
        </div>
        {!canGenerate && (
          <p className="notice" role="note">
            Live generation is switched off on this deployment because no model key is configured. The guides on the home page still work.
          </p>
        )}
      </form>

      {error && (
        <div className="notice notice--error" role="alert">
          <strong>No guide was saved.</strong> {error}
        </div>
      )}

      {(running || feed.stage) && (
        <section className="gen__log" aria-live="polite" aria-label="Progress">
          <p className="muted small">
            {running ? `Working for ${mins > 0 ? `${mins} min ` : ''}${seconds % 60} s. A first guide can take a few minutes.` : 'Stopped.'}
          </p>
          <ol className="stages">
            {STAGES.map((s, i) => {
              const state = i < stageIndex ? 'done' : i === stageIndex ? (running ? 'active' : 'stopped') : 'todo';
              return (
                <li key={s.key} className={`stages__item stages__item--${state}`}>
                  <span className="stages__dot" aria-hidden="true" />
                  <div>
                    <p className="stages__title">{s.title}</p>
                    {feed.stageMessages[s.key] && state !== 'todo' && <p className="muted small">{feed.stageMessages[s.key]}</p>}
                    {s.key === 'research' && feed.searches.length > 0 && (
                      <ul className="feed">
                        {feed.searches.slice(-4).map((q, n) => (
                          <li key={`${n}-${q}`}>Searched: {q}</li>
                        ))}
                      </ul>
                    )}
                    {s.key === 'research' && feed.sources.length > 0 && (
                      <ul className="feed">
                        {feed.sources.map((src) => (
                          <li key={src.url} className={src.ok ? '' : 'feed__bad'}>
                            {src.ok ? 'Read' : 'Could not read'}: {src.title || src.url}
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.key === 'verify' && checked > 0 && <p className="muted small">{checked} claims re-checked so far</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          {feed.warnings.length > 0 && (
            <ul className="feed feed--warn">
              {feed.warnings.map((w, i) => (
                <li key={`${i}-${w}`}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
