import { DIFFICULTY_COPY, type Difficulty } from '@/lib/schema';

/** Four-step gate meter. Colour carries the grade, but the filled count and the label say it too. */
export function GradeMeter({ difficulty, large = false }: { difficulty: Difficulty; large?: boolean }) {
  const { label, ticks } = DIFFICULTY_COPY[difficulty];
  return (
    <span className={`grade grade--${difficulty}${large ? ' grade--large' : ''}`} role="img" aria-label={`Difficulty: ${label}, ${ticks} of 4`}>
      <span className="grade__bar" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= ticks ? 'grade__seg grade__seg--on' : 'grade__seg'} />
        ))}
      </span>
      <span className="grade__label" aria-hidden="true">{label}</span>
    </span>
  );
}
