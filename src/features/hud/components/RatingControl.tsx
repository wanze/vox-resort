import { DropdownPopover } from '../../../shared/components/Dropdown';
import { Meter } from '../../../shared/components/Meter';
import { OutOf } from '../../../shared/components/OutOf';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { percentOf } from '../../../shared/components/StatRow';
import { trendArrow, trendWords } from './dayWords';
import {
  costliestPart,
  EMPTY_STARS,
  RATING_PARTS,
  starsLost,
  type Rating,
  type RatingPart,
} from '../../sim/domain/rating';
import { nextTier, starsLabel, type Prestige } from '../../sim/domain/prestige';
import { prestigeGoal, unlockedLabels } from '../domain/prestigeWords';

export interface RatingControlProps {
  readonly rating: Rating;
  // Against the morning before; null until there are two reports.
  readonly trend: number | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stepFree: { readonly reached: number; readonly venues: number };
  readonly prestige: Prestige | null;
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
          <dt className="ui-label">{PART_WORDS[part]}</dt>
          <dd className="hud-rating-figures">
            <Meter level={rating[part]} />
            <span>{percentOf(rating[part])}</span>
            <span className="hud-rating-lost">{lostWords(starsLost(rating, part))}</span>
          </dd>
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
      <span className="ui-label">Step-free</span>
      <span>
        <OutOf value={reached} total={venues} /> venues
      </span>
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

// Laid out as a rating part: the tier, a meter of the streak, and the days in it.
function GoalLine({ prestige }: { readonly prestige: Prestige | null }) {
  const next = prestige ? nextTier(prestige) : null;
  if (!next) return null;
  const labels = unlockedLabels(next.tier);
  return (
    <>
      <hr className="ui-rule" />
      <dl className="hud-rating-parts">
        <div className="hud-rating-part">
          <dt className="ui-label">{`${starsLabel(next.tier)} days in a row`}</dt>
          <dd className="hud-rating-figures hud-rating-streak">
            <Meter level={next.days / next.of} />
            <OutOf value={next.days} total={next.of} unit="days" />
          </dd>
        </div>
      </dl>
      {labels.length > 0 ? <p className="hud-rating-note">Unlocks {labels.join(', ')}.</p> : null}
    </>
  );
}

export function RatingControl(props: RatingControlProps) {
  const { rating, trend, open, onOpenChange, stepFree } = props;
  const stars = rating.stars.toFixed(1);
  const arrow = trendArrow(trend);
  const change = trendWords(trend);
  const goal = props.prestige ? prestigeGoal(props.prestige) : null;
  const said = change
    ? `Rating: ${stars} stars, ${change} since the day before`
    : `Rating: ${stars} stars`;
  return (
    <DropdownPopover
      name="Rating"
      className="hud-rating"
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? `${said}. Next: ${goal}` : said}
      label={<StarFigure stars={stars} arrow={arrow} />}
    >
      <RatingBreakdown rating={rating} />
      <StepFreeLine {...stepFree} />
      <GoalLine prestige={props.prestige} />
      <hr className="ui-rule" />
      <p className="hud-rating-note">
        Set each morning at check-in. The more stars, the more guests arrive.
      </p>
    </DropdownPopover>
  );
}
