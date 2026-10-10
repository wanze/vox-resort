export interface Rating {
  readonly stars: number;
  readonly happiness: number;
  readonly housed: number;
  readonly cleanliness: number;
}

// Cleanliness weighs least because dirt already reaches happiness through guests
// walking further; full weight would charge the player twice.
const HAPPINESS_SHARE = 0.7;
const HOUSED_SHARE = 0.2;
const CLEAN_SHARE = 1 - HAPPINESS_SHARE - HOUSED_SHARE;

// Arrivals follow the rating, so an empty plot rating zero could never fill.
export const EMPTY_STARS = 3;

// Stays average eight and a half nights, so a seventh of all beds a night keeps a five-star resort
// full and a three-star one two thirds full. Of all beds, not the free ones: a share of the free
// beds shrinks as the resort fills, which held even a five-star resort near two thirds.
export const ARRIVALS_SHARE = 0.15;

const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

// Nobody books a one-star resort; the appetite grows evenly from there to five.
const appetiteFor = (stars: number): number => clamp((stars - 1) / 4);

export function ratingFor(parts: {
  readonly happiness: number | null;
  readonly present: number;
  readonly housed: number;
  readonly cleanliness?: number;
}): Rating {
  const housed = parts.present > 0 ? clamp(parts.housed / parts.present) : 0;
  const cleanliness = clamp(parts.cleanliness ?? 1);
  if (parts.happiness === null) {
    return { stars: EMPTY_STARS, happiness: 0, housed, cleanliness };
  }
  const happiness = clamp(parts.happiness);
  return {
    stars: oneDecimal(
      5 * (HAPPINESS_SHARE * happiness + HOUSED_SHARE * housed + CLEAN_SHARE * cleanliness),
    ),
    happiness,
    housed,
    cleanliness,
  };
}

// At least 1 while anybody books at all, or a small plot rounding to nobody would never see a coach.
// A pull above 1 is allowed: cheap beds bring more coaches, still capped by the beds free.
export function arrivalsFor(
  rating: Rating,
  beds: { readonly free: number; readonly total: number },
  pull = 1,
): number {
  const free = Math.max(0, Math.floor(beds.free));
  const appetite = appetiteFor(rating.stars) * Math.max(0, pull);
  if (free === 0 || appetite === 0) return 0;
  const wanted = Math.max(1, Math.round(Math.max(0, beds.total) * ARRIVALS_SHARE * appetite));
  return Math.min(free, wanted);
}

export type RatingPart = 'happiness' | 'housed' | 'cleanliness';

export const RATING_PARTS: readonly RatingPart[] = ['happiness', 'housed', 'cleanliness'];

const SHARES: Readonly<Record<RatingPart, number>> = {
  happiness: HAPPINESS_SHARE,
  housed: HOUSED_SHARE,
  cleanliness: CLEAN_SHARE,
};

// A loss under a tenth of a star rounds away in the HUD, so it is not worth naming.
const NOTABLE_LOSS = 0.1;

// Stars this part would add if it were perfect; the HUD names the largest as the one to fix.
export function starsLost(rating: Rating, part: RatingPart): number {
  return oneDecimal(5 * SHARES[part] * (1 - rating[part]));
}

export function costliestPart(rating: Rating): RatingPart | null {
  let costliest: RatingPart | null = null;
  let most = 0;
  for (const part of RATING_PARTS) {
    const lost = starsLost(rating, part);
    if (lost >= NOTABLE_LOSS && lost > most) {
      costliest = part;
      most = lost;
    }
  }
  return costliest;
}
