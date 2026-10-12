import { quoteOf, type Review } from '../../sim/domain/reviews';
import { remarksOf, type Remark } from '../domain/remarks';
import { THOUGHT_LABELS, thoughtLine } from '../domain/thoughtWords';
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
        <span>{thoughtLine(tally.kind, tally.subject)}</span>
        <span className="hud-remark-count">{`${tally.count.toLocaleString('en-US')}×`}</span>
        <span className="ui-track" aria-hidden="true">
          <span className="hud-remark-fill" style={{ width: `${remark.share * 100}%` }} />
        </span>
      </span>
    </li>
  );
}

const nightsOf = (count: number): string => `${count} ${count === 1 ? 'night' : 'nights'}`;

function ReviewRow({ review }: { readonly review: Review }) {
  const said = saidOf(review);
  return (
    <li className="hud-review">
      <span>
        <strong>{`${review.stars} ★`}</strong>
        {` ${review.name}, ${nightsOf(review.nights)}`}
      </span>
      {said ? <span className="ui-stat-note">“{said}”</span> : null}
    </li>
  );
}

// Shared with the day report, so what guests said reads the same on the day and after it.
export function RemarkList({ loudest }: { readonly loudest: VoicesView['loudest'] }) {
  return (
    <ul className="hud-remarks">
      {remarksOf(loudest).map((remark) => (
        <RemarkRow key={`${remark.tally.kind}|${remark.tally.subject ?? ''}`} remark={remark} />
      ))}
    </ul>
  );
}

function RemarksSection({ loudest }: { readonly loudest: VoicesView['loudest'] }) {
  if (loudest.length === 0) return null;
  return (
    <section aria-label="What guests say today">
      <h3 className="hud-report-heading">What guests say today</h3>
      <RemarkList loudest={loudest} />
    </section>
  );
}

function ReviewsSection({ reviews }: { readonly reviews: VoicesView['reviews'] }) {
  if (reviews.length === 0) return null;
  return (
    <section aria-label="Latest reviews">
      <h3 className="hud-report-heading">Latest reviews</h3>
      <ul className="hud-reviews">
        {reviews.slice(0, REVIEWS_SHOWN).map((review) => (
          <ReviewRow key={review.party} review={review} />
        ))}
      </ul>
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
