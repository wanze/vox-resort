// How much fuller every need must be before a guest who expects the most is content: three quarters
// instead of half.
export const EXPECTED_CONTENT_RISE = 0.25;

// The stars weigh more than the price: a guest books a reputation first and a bed second.
const REPUTATION_SHARE = 0.6;
const PRICE_SHARE = 1 - REPUTATION_SHARE;

// Below two and a half stars nobody booked expecting much; at five, everybody did.
const MODEST_STARS = 2.5;
const STARS_RANGE = 5 - MODEST_STARS;

// A bed at a fifth below its list price is a bargain nobody judges; at 1.6 times, every bed is.
const BARGAIN_SHARE = 0.8;
const PRICE_RANGE = 0.8;

// A little over list is the dearest surroundings, not an overcharge.
const LIST_TOLERANCE = 1.05;

// A demanding guest wants more for the extra they paid before they stop grumbling.
const WORTH_IT_MOOD = 0.55;
const WORTH_IT_RISE = 0.25;

const GOOD_VALUE_MOOD = 0.8;

const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

export function expectationFor(stars: number, paidShare: number): number {
  const reputation = clamp((stars - MODEST_STARS) / STARS_RANGE);
  const price = clamp((paidShare - BARGAIN_SHARE) / PRICE_RANGE);
  return clamp(REPUTATION_SHARE * reputation + PRICE_SHARE * price);
}

// A free bed is neither a bargain nor dear.
export const paidShareOf = (charged: number, listed: number): number =>
  listed > 0 ? charged / listed : 1;

export type Expectation = 'easy-going' | 'particular' | 'demanding' | 'hard-to-please';

export function expectationWords(expects: number): Expectation {
  if (expects < 0.25) return 'easy-going';
  if (expects < 0.5) return 'particular';
  if (expects < 0.75) return 'demanding';
  return 'hard-to-please';
}

export function valueThought(
  mood: number,
  expects: number,
  paidShare: number,
): 'not-worth-it' | 'good-value' | null {
  if (paidShare > LIST_TOLERANCE) {
    return mood < WORTH_IT_MOOD + WORTH_IT_RISE * expects ? 'not-worth-it' : null;
  }
  return mood >= GOOD_VALUE_MOOD ? 'good-value' : null;
}
