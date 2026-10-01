import { HudDropdown } from './HudDropdown';
import { HudReadout } from './HudReadout';
import { PixelIcon } from './PixelIcon';
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
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
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

function Breakdown({ rating }: { readonly rating: Rating }) {
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

export function RatingControl({ rating, open, onOpenChange }: RatingControlProps) {
  const stars = rating.stars.toFixed(1);
  return (
    <HudDropdown
      className="hud-rating"
      open={open}
      onOpenChange={onOpenChange}
      title={`Rating: ${stars} stars`}
      label={<HudReadout icon={<PixelIcon name="star" />} label="Rating" value={`${stars} ★`} />}
    >
      <Breakdown rating={rating} />
      <hr className="hud-rule" />
      <p className="hud-rating-note">
        Set each morning at check-in. The more stars, the more guests arrive.
      </p>
    </HudDropdown>
  );
}
