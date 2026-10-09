import { quoteOf, type Review } from '../../sim/domain/reviews';
import type { ThoughtTally } from '../../sim/domain/thoughts';
import { StatRow } from '../../../shared/components/StatRow';
import { THOUGHT_LABELS, thoughtLine } from './thoughtWords';
import type { VoicesView } from '../domain/views';

export interface GuestsPanelProps {
  readonly voices: VoicesView;
}

const REVIEWS_SHOWN = 5;

// The subject belongs to the complaint; a praise is worded without one, but for a photo's.
function saidOf(review: Review): string | null {
  const quoted = quoteOf(review);
  if (!quoted) return null;
  if (quoted === review.complaint) return thoughtLine(quoted, review.subject);
  return thoughtLine(quoted, review.praiseSubject ?? null);
}

function LoudestRow({ tally }: { readonly tally: ThoughtTally }) {
  return (
    <StatRow label={THOUGHT_LABELS[tally.kind]} note={`${tally.count}×`}>
      {thoughtLine(tally.kind, tally.subject)}
    </StatRow>
  );
}

function ReviewRow({ review }: { readonly review: Review }) {
  const said = saidOf(review);
  return (
    <StatRow label="Review">
      {`${review.name}, `}
      {review.nights}
      {' nights, '}
      {`${review.stars}★`}
      {said ? (
        <>
          <br />
          <span className="ui-stat-note">“{said}”</span>
        </>
      ) : null}
    </StatRow>
  );
}

export function GuestsPanel({ voices }: GuestsPanelProps) {
  const { loudest, reviews } = voices;
  if (loudest.length === 0 && reviews.length === 0) {
    return <p className="ui-loading">Nobody has said anything yet.</p>;
  }
  return (
    <dl className="ui-stats hud-advice">
      {loudest.map((tally) => (
        <LoudestRow key={`${tally.kind}|${tally.subject ?? ''}`} tally={tally} />
      ))}
      {reviews.slice(0, REVIEWS_SHOWN).map((review) => (
        <ReviewRow key={review.party} review={review} />
      ))}
    </dl>
  );
}
