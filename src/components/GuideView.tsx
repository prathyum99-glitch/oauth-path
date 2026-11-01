import { DIFFICULTY_COPY, EVIDENCE_COPY, type Evidence, type Guide } from '@/lib/schema';
import { evidenceCounts, weakestEvidence } from '@/lib/view';
import { safeHref } from '@/lib/safe-href';
import { GradeMeter } from './GradeMeter';
import { CheckChip, EvidenceChip } from './EvidenceChip';
import { ComposioBlock } from './ComposioBlock';

const WHO_LABEL = { agent: 'Agent', you: 'You', both: 'Agent + you' } as const;

function Refs({ guide, refs }: { guide: Guide; refs: string[] }) {
  const ev = weakestEvidence(guide, refs);
  return (
    <span className="refs">
      <EvidenceChip evidence={ev} />
      {refs
        .filter((r) => guide.claims.some((c) => c.id === r))
        .map((r) => (
          <a key={r} className="refs__id" href={`#claim-${r}`} aria-label={`See evidence ${r}`}>
            {r}
          </a>
        ))}
    </span>
  );
}

function Link({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function GuideView({ guide, persistent }: { guide: Guide; persistent: boolean }) {
  const counts = evidenceCounts(guide);
  const unchecked = guide.claims.filter((c) => c.check.status === 'not_checked').length;
  const flagged = guide.claims.filter((c) => c.check.status === 'unsupported' || c.check.status === 'unreachable').length;
  const evidenceOrder: Evidence[] = ['official', 'secondary', 'inferred', 'unverified'];

  return (
    <article className="guide">
      <header className="guide__head">
        <p className="kicker">{guide.app.category}</p>
        <h1 className="guide__title">{guide.app.name}</h1>
        <div className="verdict">
          <GradeMeter difficulty={guide.verdict.difficulty} large />
          <p className="verdict__headline">{guide.verdict.headline}</p>
        </div>
        <dl className="facts">
          <div className="facts__item">
            <dt>Your time</dt>
            <dd>{guide.verdict.effort.label}</dd>
          </div>
          <div className="facts__item">
            <dt>Provider wait</dt>
            <dd>
              {guide.verdict.wait.label}
              <span className="facts__basis">
                {guide.verdict.wait.basis === 'none' ? 'No source gives a figure' : `Basis: ${guide.verdict.wait.basis}`}
              </span>
            </dd>
          </div>
          <div className="facts__item">
            <dt>Tested by a person</dt>
            <dd>
              {guide.handsOn.tested ? 'Yes' : 'No'}
              <span className="facts__basis">Researched {guide.researchedOn}</span>
            </dd>
          </div>
        </dl>
        <div className="support">
          <p className="refs-label">Weakest support behind this verdict</p>
          <Refs guide={guide} refs={guide.verdict.refs} />
        </div>
        <p className="guide__summary">{guide.summary}</p>
        <p className="muted small">{DIFFICULTY_COPY[guide.verdict.difficulty].blurb}</p>
      </header>

      {guide.origin === 'live' && (
        <div className="notice" role="note">
          <strong>Written by an agent just now.</strong> It read the pages listed under Sources and a second agent re-read each cited page
          against the claims. Nobody has run this setup by hand.
          {!persistent && ' This server has no database, so the share link may stop working after a redeploy.'}
        </div>
      )}
      {guide.origin === 'seed' && !guide.handsOn.tested && (
        <div className="notice" role="note">
          <strong>Researched from the provider's pages, not run by hand.</strong> Claims below show which page supports them and whether a
          second agent re-checked them.
        </div>
      )}

      {guide.prerequisites.length > 0 && (
        <section className="section" aria-labelledby="pre-h">
          <h2 id="pre-h" className="section__title">Have these ready</h2>
          <ul className="rows">
            {guide.prerequisites.map((p) => (
              <li key={p.item} className="rows__item">
                <div>
                  <strong>{p.item}</strong>
                  <p className="rows__detail">{p.detail}</p>
                </div>
                <Refs guide={guide} refs={p.refs} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="who-h">
        <h2 id="who-h" className="section__title">What the agent can do, and where you take over</h2>
        <div className="split">
          <div className="split__col split__col--agent">
            <h3>Agent can</h3>
            <ul>
              {guide.handoff.agentCanDo.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div className="split__col split__col--you">
            <h3>Only you can</h3>
            <ul>
              {guide.handoff.youMustDo.map((y) => (
                <li key={y}>{y}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="route-h">
        <h2 id="route-h" className="section__title">The route</h2>
        <ol className="route">
          {guide.steps.map((s, i) => (
            <li key={`${i}-${s.title}`} className={`route__stop route__stop--${s.who}`}>
              <span className="route__node" aria-hidden="true">{i + 1}</span>
              <div className="route__body">
                <div className="route__top">
                  <h3 className="route__title">{s.title}</h3>
                  <span className={`who who--${s.who}`}>{WHO_LABEL[s.who]}</span>
                </div>
                <p className="route__detail">{s.detail}</p>
                <div className="route__meta">
                  <Refs guide={guide} refs={s.refs} />
                  {s.link && safeHref(s.link) && (
                    <Link href={s.link}>Official page</Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {guide.limits.length > 0 && (
        <section className="section" aria-labelledby="lim-h">
          <h2 id="lim-h" className="section__title">Limits to know</h2>
          <ul className="rows">
            {guide.limits.map((l) => (
              <li key={l.title} className="rows__item">
                <div>
                  <strong>{l.title}</strong>
                  <p className="rows__detail">{l.detail}</p>
                </div>
                <Refs guide={guide} refs={l.refs} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {guide.blockers.length > 0 && (
        <section className="section" aria-labelledby="blk-h">
          <h2 id="blk-h" className="section__title">Where it usually gets stuck</h2>
          <ul className="rows">
            {guide.blockers.map((b) => (
              <li key={b.problem} className="rows__item rows__item--stack">
                <strong>{b.problem}</strong>
                <p className="rows__detail">{b.why}</p>
                <p className="rows__next"><span className="rows__nextlabel">Next move</span> {b.nextMove}</p>
                <Refs guide={guide} refs={b.refs} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ComposioBlock composio={guide.composio} appName={guide.app.name} />

      <section className="section" aria-labelledby="ev-h">
        <h2 id="ev-h" className="section__title">What we know, and how we know it</h2>
        <p className="muted">
          {guide.claims.length} claims behind this guide:{' '}
          {evidenceOrder
            .filter((e) => counts[e] > 0)
            .map((e) => `${counts[e]} ${EVIDENCE_COPY[e].label.toLowerCase()}`)
            .join(', ')}
          .{' '}
          {unchecked === guide.claims.length
            ? 'A second agent has not re-checked them yet.'
            : `${guide.claims.length - unchecked} were re-read by a second agent${flagged ? `, ${flagged} could not be confirmed` : ''}.`}
        </p>

        {guide.uncertainties.length > 0 && (
          <div className="panel panel--warn">
            <h3 className="panel__title">Could not be confirmed</h3>
            <ul>
              {guide.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {guide.corrections.length > 0 && (
          <div className="panel">
            <h3 className="panel__title">Learned while checking</h3>
            <ul className="corrections">
              {guide.corrections.map((c) => (
                <li key={c.was}>
                  <span className="corrections__was">{c.was}</span>
                  <span className="corrections__now">{c.now}</span>
                  <span className="muted small">{c.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="claims">
          {guide.claims.map((c) => (
            <li key={c.id} id={`claim-${c.id}`} className="claims__item">
              <span className="claims__id">{c.id}</span>
              <div className="claims__body">
                <p>{c.text}</p>
                <div className="claims__meta">
                  <EvidenceChip evidence={c.evidence} />
                  <CheckChip status={c.check.status} />
                  {c.sources.map((u) => (
                    <Link key={u} href={u}>
                      {hostPath(u)}
                    </Link>
                  ))}
                </div>
                {c.check.note && <p className="muted small">{c.check.note}</p>}
              </div>
            </li>
          ))}
        </ul>

        <h3 className="panel__title">Sources</h3>
        <ul className="sources">
          {guide.sources.map((s) => (
            <li key={s.url} className="sources__item">
              <Link href={s.url}>{s.title}</Link>
              <span className={`sources__status sources__status--${s.status}`}>
                {s.status === 'read' ? 'Read' : s.status === 'unreachable' ? 'Could not be read' : 'Not read'}
              </span>
              <span className="muted small">{s.kind === 'official' ? 'Official' : 'Secondary'}. {s.note}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          {guide.origin === 'live' ? `Generated with ${guide.model ?? 'an AI model'} on ${guide.researchedOn}.` : `Researched ${guide.researchedOn}.`}{' '}
          {guide.handsOn.note}
        </p>
      </section>
    </article>
  );
}

function hostPath(u: string): string {
  try {
    const x = new URL(u);
    const p = x.pathname.length > 28 ? `${x.pathname.slice(0, 27)}…` : x.pathname;
    return `${x.hostname}${p === '/' ? '' : p}`;
  } catch {
    return u;
  }
}
