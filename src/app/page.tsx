import { Finder } from '@/components/Finder';
import { hasApiKey } from '@/lib/llm';
import { DIFFICULTY_COPY, EVIDENCE_COPY, type Difficulty, type Evidence } from '@/lib/schema';
import { listGuides } from '@/lib/storage';
import { summarize } from '@/lib/view';
import { GradeMeter } from '@/components/GradeMeter';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const guides = (await listGuides()).map(summarize);
  const grades: Difficulty[] = ['easy', 'moderate', 'hard', 'gated'];
  const evidence: Evidence[] = ['official', 'secondary', 'inferred', 'unverified'];
  return (
    <>
      <section className="hero">
        <h1 className="hero__title">How hard is it to get an OAuth app approved?</h1>
        <p className="hero__lede">
          Pick an app to see the time it takes, what the provider asks for, and which steps an agent can do for you. If the app is not on
          the board, an agent researches it from the provider's own pages while you wait.
        </p>
      </section>

      <Finder guides={guides} canGenerate={hasApiKey()} />

      <section className="legend" aria-label="How to read a guide">
        <div>
          <h2 className="legend__title">Grades</h2>
          <ul className="legend__list">
            {grades.map((g) => (
              <li key={g}>
                <GradeMeter difficulty={g} />
                <span className="muted small">{DIFFICULTY_COPY[g].blurb}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="legend__title">Evidence</h2>
          <ul className="legend__list">
            {evidence.map((e) => (
              <li key={e}>
                <span className={`chip chip--${e}`}>
                  <span className="chip__mark" aria-hidden="true" />
                  {EVIDENCE_COPY[e].label}
                </span>
                <span className="muted small">{EVIDENCE_COPY[e].blurb}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
