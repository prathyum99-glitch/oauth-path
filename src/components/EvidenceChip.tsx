import { EVIDENCE_COPY, type CheckStatus, type Evidence } from '@/lib/schema';
import { CHECK_COPY } from '@/lib/view';

export function EvidenceChip({ evidence }: { evidence: Evidence | null }) {
  if (!evidence) return <span className="chip chip--none" title="No claim in the evidence list backs this">No source</span>;
  const { label, blurb } = EVIDENCE_COPY[evidence];
  return (
    <span className={`chip chip--${evidence}`} title={blurb}>
      <span className="chip__mark" aria-hidden="true" />
      {label}
    </span>
  );
}

export function CheckChip({ status }: { status: CheckStatus }) {
  return <span className={`check check--${status}`}>{CHECK_COPY[status]}</span>;
}
