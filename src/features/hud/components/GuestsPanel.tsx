import { quoteOf, type Review } from '../../sim/domain/reviews';
import { StatRow } from '../../../shared/components/StatRow';
import { remarksOf, type Remark } from '../domain/remarks';
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

function RemarkRow({ remark }: { readonly remark: Remark }) {
  const { tally } = remark;
  return (
    <li className="hud-remark" data-tone={remark.complaint ? 'bad' : 'good'}>
      <span className="ui-label">{THOUGHT_LABELS[tally.kind]}</span>
      <span className="hud-remark-said">
        {thoughtLine(tally.kind, tally.subject)}
        <span className="hud-remark-bar" aria-hidden="true">
          <span className="hud-remark-fill" style={{ width: `${remark.share * 100}%` }} />
        </span>
      </span>
      <span className="hud-remark-count">{tally.count}×</span>
    </li>
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

function RemarksSection({ loudest }: { readonly loudest: VoicesView['loudest'] }) {
  if (loudest.length === 0) return null;
  return (
    <section aria-label="What guests say today">
      <h3 className="hud-report-heading">What guests say today</h3>
      <ul className="hud-remarks">
        {remarksOf(loudest).map((remark) => (
          <RemarkRow key={`${remark.tally.kind}|${remark.tally.subject ?? ''}`} remark={remark} />
        ))}
      </ul>
    </section>
  );
}

function ReviewsSection({ reviews }: { readonly reviews: VoicesView['reviews'] }) {
  if (reviews.length === 0) return null;
  return (
    <section aria-label="Latest reviews">
      <h3 className="hud-report-heading">Latest reviews</h3>
      <dl className="ui-stats hud-advice">
        {reviews.slice(0, REVIEWS_SHOWN).map((review) => (
          <ReviewRow key={review.party} review={review} />
        ))}
      </dl>
    </section>
  );
}

export function GuestsPanel({ voices }: GuestsPanelProps) {
  const { loudest, reviews } = voices;
  if (loudest.length === 0 && reviews.length === 0) {
    return <p className="ui-loading">Nobody has said anything yet.</p>;
  }
  return (
    <div className="hud-guests">
      <RemarksSection loudest={loudest} />
      <ReviewsSection reviews={reviews} />
    </div>
  );
}
