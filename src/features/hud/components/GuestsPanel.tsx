import type { VoicesView } from '../../../app/showcase';
import { quoteOf, type Review } from '../../sim/domain/reviews';
import type { ThoughtTally } from '../../sim/domain/thoughts';
import { StatRow } from './StatRow';
import { THOUGHT_LABELS, thoughtLine } from './thoughtWords';

export interface GuestsPanelProps {
  readonly voices: VoicesView;
}

const REVIEWS_SHOWN = 5;

// The subject belongs to the complaint; a praise is worded without one.
function saidOf(review: Review): string | null {
  const quoted = quoteOf(review);
  if (!quoted) return null;
  return thoughtLine(quoted, quoted === review.complaint ? review.subject : null);
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
      {`${review.name}, ${review.nights} nights, ${review.stars}★`}
      {said ? (
        <>
          <br />
          <span className="hud-stat-note">“{said}”</span>
        </>
      ) : null}
    </StatRow>
  );
}

export function GuestsPanel({ voices }: GuestsPanelProps) {
  const { loudest, reviews } = voices;
  if (loudest.length === 0 && reviews.length === 0) {
    return <p className="hud-loading">Nobody has said anything yet.</p>;
  }
  return (
    <dl className="hud-stats hud-advice">
      {loudest.map((tally) => (
        <LoudestRow key={`${tally.kind}|${tally.subject ?? ''}`} tally={tally} />
      ))}
      {reviews.slice(0, REVIEWS_SHOWN).map((review) => (
        <ReviewRow key={review.party} review={review} />
      ))}
    </dl>
  );
}
