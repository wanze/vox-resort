import { HudPopover } from './HudDropdown';
import { PixelIcon } from './PixelIcon';
import { trendArrow, trendWords } from './dayWords';
import {
  costliestPart,
  EMPTY_STARS,
  RATING_PARTS,
  starsLost,
  type Rating,
  type RatingPart,
} from '../../sim/domain/rating';

export interface RatingControlProps {
  readonly rating: Rating;
  // Against the morning before; null until there are two reports.
  readonly trend: number | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stepFree: { readonly reached: number; readonly venues: number };
}

const PART_WORDS: Readonly<Record<RatingPart, string>> = {
  happiness: 'Happy guests',
  housed: 'Guests with a bed',
  cleanliness: 'Clean venues',
};

const lostWords = (lost: number): string => (lost > 0 ? `−${lost.toFixed(1)} ★` : '0.0 ★');

// A rated resort with no happiness at all tops out at 1.5 stars, so this can only be the
// benefit of the doubt an empty plot gets, whose parts do not add up to its stars.
const unrated = (rating: Rating): boolean => rating.happiness === 0 && rating.stars === EMPTY_STARS;

export function RatingBreakdown({ rating }: { readonly rating: Rating }) {
  if (unrated(rating)) {
    return <p className="hud-rating-note">No guests have stayed the night yet.</p>;
  }
  const costliest = costliestPart(rating);
  return (
    <dl className="hud-rating-parts">
      {RATING_PARTS.map((part) => (
        <div key={part} className="hud-rating-part" data-costliest={part === costliest}>
          <dt>{PART_WORDS[part]}</dt>
          <dd>{`${Math.round(rating[part] * 100)}%`}</dd>
          <dd className="hud-rating-lost">{lostWords(starsLost(rating, part))}</dd>
        </div>
      ))}
    </dl>
  );
}

// No star value beside it: wheelchair guests who cannot get somewhere are unhappy, and that
// already reaches the stars through happiness.
function StepFreeLine({ reached, venues }: RatingControlProps['stepFree']) {
  if (venues === 0) return null;
  return (
    <p className="hud-rating-step-free" title="For the record only: it counts toward no star">
      <span>Step-free</span>
      <span>{`${reached} of ${venues} venues`}</span>
    </p>
  );
}

function StarFigure({ stars, arrow }: { readonly stars: string; readonly arrow: string }) {
  return (
    <span className="hud-stars">
      <PixelIcon name="star" scale={1} />
      <span className="hud-readout-value">{stars}</span>
      {arrow ? <span className="hud-stars-trend">{arrow}</span> : null}
    </span>
  );
}

export function RatingControl({ rating, trend, open, onOpenChange, stepFree }: RatingControlProps) {
  const stars = rating.stars.toFixed(1);
  const arrow = trendArrow(trend);
  const change = trendWords(trend);
  return (
    <HudPopover
      name="Rating"
      className="hud-rating"
      open={open}
      onOpenChange={onOpenChange}
      title={
        change ? `Rating: ${stars} stars, ${change} since the day before` : `Rating: ${stars} stars`
      }
      label={<StarFigure stars={stars} arrow={arrow} />}
    >
      <RatingBreakdown rating={rating} />
      <StepFreeLine {...stepFree} />
      <hr className="hud-rule" />
      <p className="hud-rating-note">
        Set each morning at check-in. The more stars, the more guests arrive.
      </p>
    </HudPopover>
  );
}
