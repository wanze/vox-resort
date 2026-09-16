/**
 * What the resort is worth, and how many people that brings tomorrow.
 *
 * The other half of the loop. Everything the player builds changes what guests
 * *do*; this is what makes it change *how many* of them there are, which is what
 * turns a bakery from decoration into a decision.
 *
 * ## Two terms and no more
 *
 * Happiness is the whole of what a guest experienced - queues, walks, needs met
 * and needs not - and `happiness.ts` is where all of that arrives. The share of
 * guests the resort found a bed for is the one thing happiness cannot see,
 * because a guest with no bed simply walks all night and their energy says so a
 * day later, by which time it reads as a resort with too few benches.
 *
 * Money is not a term, and must not become one: that is plan 024, and a rating
 * is a number about guests rather than about a budget.
 */

/** What the resort is worth, out of five. */
export interface Rating {
  /** 0..5, one decimal place as the HUD shows it. */
  readonly stars: number;
  /**
   * What made it what it is, 0..1 each, for plan 021's advice and the HUD's
   * note. Both 0 on a resort with nobody on it, whose stars are
   * {@link EMPTY_STARS} rather than anything derived from these.
   */
  readonly happiness: number;
  readonly housed: number;
}

/**
 * How the two terms are weighed against each other.
 *
 * Happiness carries three quarters because it is the term the player has most
 * ways to move; a bed is nearly a precondition rather than an amenity, and a
 * resort that houses everybody and pleases nobody is still a bad resort.
 */
const HAPPINESS_SHARE = 0.75;
const HOUSED_SHARE = 1 - HAPPINESS_SHARE;

/**
 * What a resort with nobody on it is worth.
 *
 * The benefit of the doubt, and it has to be: arrivals follow the rating, so a
 * plot that rated zero while empty could never fill and the first thing a player
 * built would never be visited.
 */
export const EMPTY_STARS = 3;

/**
 * The most of the free beds that may fill in one night.
 *
 * A resort that fills in one morning is a resort whose rating never had a chance
 * to mean anything: the player would see the plot full before any of their
 * building had been lived in. A quarter a night fills a good resort inside a
 * week and lets a bad one empty at about the rate stays run out.
 */
export const MAX_ARRIVALS_SHARE = 0.25;

const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** One decimal place, which is what the HUD shows and what a test can pin. */
const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

/**
 * The resort's rating: how happy its guests are, and how many of them it could
 * find a bed for.
 */
export function ratingFor(parts: {
  readonly happiness: number | null;
  readonly present: number;
  readonly housed: number;
}): Rating {
  const housed = parts.present > 0 ? clamp(parts.housed / parts.present) : 0;
  // Nobody has been here, so nobody has been let down. Both terms are reported
  // as the nothing they are, and the stars are the only number not read off
  // them - see {@link EMPTY_STARS}.
  if (parts.happiness === null) return { stars: EMPTY_STARS, happiness: 0, housed };
  const happiness = clamp(parts.happiness);
  return {
    stars: oneDecimal(5 * (HAPPINESS_SHARE * happiness + HOUSED_SHARE * housed)),
    happiness,
    housed,
  };
}

/**
 * How many people want to check in tomorrow, given the rating and the beds
 * standing free.
 *
 * Never more than the free beds, because a guest with nowhere to sleep is a
 * guest who will be unhappy about it and drag the rating down - the resort turns
 * them away at the gate instead. Never more than {@link MAX_ARRIVALS_SHARE} of
 * them in one night either.
 *
 * Linear in the stars: none at all at zero, and the whole cap at five. A resort
 * with free beds and any rating at all takes at least one party's worth, or a
 * plot down to its last three beds would never see another coach.
 */
export function arrivalsFor(rating: Rating, freeBeds: number): number {
  const beds = Math.max(0, Math.floor(freeBeds));
  if (beds === 0) return 0;
  const cap = Math.max(1, Math.round(beds * MAX_ARRIVALS_SHARE));
  return Math.min(beds, Math.round(cap * clamp(rating.stars / 5)));
}
