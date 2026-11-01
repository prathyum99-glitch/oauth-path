'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DIFFICULTY_COPY, type Difficulty } from '@/lib/schema';
import type { GuideSummary } from '@/lib/view';
import { GradeMeter } from './GradeMeter';

const FILTERS: Array<{ key: Difficulty | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'easy', label: DIFFICULTY_COPY.easy.label },
  { key: 'moderate', label: DIFFICULTY_COPY.moderate.label },
  { key: 'hard', label: DIFFICULTY_COPY.hard.label },
  { key: 'gated', label: DIFFICULTY_COPY.gated.label },
];

const TRY: string[] = ['QuickBooks', 'Zoom', 'HubSpot'];

export function Finder({ guides, canGenerate }: { guides: GuideSummary[]; canGenerate: boolean }) {
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<Difficulty | 'all'>('all');
  const term = q.trim();

  const shown = useMemo(() => {
    const t = term.toLowerCase();
    return guides.filter(
      (g) => (level === 'all' || g.difficulty === level) && (!t || g.name.toLowerCase().includes(t) || g.category.toLowerCase().includes(t)),
    );
  }, [guides, level, term]);

  const exact = guides.some((g) => g.name.toLowerCase() === term.toLowerCase());
  const showGenerate = term.length >= 2 && !exact;

  return (
    <div className="finder">
      <form
        className="finder__form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label htmlFor="finder-q" className="finder__label">Which app do you want to connect?</label>
        <input
          id="finder-q"
          className="input input--lg"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="App name or website, for example Slack or quickbooks.intuit.com"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />
      </form>

      {showGenerate && (
        <div className="callout">
          <div>
            <strong>{shown.length === 0 ? `No guide for “${term}” yet.` : `Not the one you meant?`}</strong>
            <p className="muted small">
              {canGenerate
                ? 'An agent can research it now from the provider\'s own pages and write a shareable guide. It takes a few minutes.'
                : 'Live generation is switched off on this deployment.'}
            </p>
          </div>
          {canGenerate && (
            <Link className="btn btn--primary" href={`/new?q=${encodeURIComponent(term)}&go=1`}>
              Investigate {term.length > 24 ? `${term.slice(0, 23)}…` : term}
            </Link>
          )}
        </div>
      )}

      <div className="chips" role="group" aria-label="Filter by difficulty">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={level === f.key ? 'pill pill--on' : 'pill'}
            aria-pressed={level === f.key}
            onClick={() => setLevel(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="board" aria-label="Guides">
          <li className="board__head" aria-hidden="true">
            <span>App</span>
            <span>Difficulty</span>
            <span>Your time</span>
            <span>Provider wait</span>
          </li>
          {shown.map((g) => (
            <li key={g.slug}>
              <Link href={`/g/${g.slug}`} className="board__row">
                <span className="board__app">
                  <span className="board__name">{g.name}</span>
                  <span className="board__cat">{g.category}{g.origin === 'live' ? '. Generated live' : ''}</span>
                </span>
                <span className="board__grade"><GradeMeter difficulty={g.difficulty} /></span>
                <span className="board__cell" data-label="Your time">{g.effortLabel}</span>
                <span className="board__cell" data-label="Provider wait">{g.waitLabel}</span>
                <span className="board__headline">{g.headline}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        !showGenerate && <p className="muted">Nothing matches that filter.</p>
      )}

      {canGenerate && (
        <p className="finder__try muted small">
          Not on the board? Try one live:{' '}
          {TRY.map((t, i) => (
            <span key={t}>
              <Link href={`/new?q=${encodeURIComponent(t)}&go=1`}>{t}</Link>
              {i < TRY.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
