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

// A quarter a night fills a good resort within a week, so the rating has time to mean something.
export const MAX_ARRIVALS_SHARE = 0.25;

const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

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

// The cap is at least 1, or a plot down to its last beds would never see another coach.
export function arrivalsFor(rating: Rating, freeBeds: number): number {
  const beds = Math.max(0, Math.floor(freeBeds));
  if (beds === 0) return 0;
  const cap = Math.max(1, Math.round(beds * MAX_ARRIVALS_SHARE));
  return Math.min(beds, Math.round(cap * clamp(rating.stars / 5)));
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
