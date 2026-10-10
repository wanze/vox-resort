import { familyOf, OBJECT_TYPES, signFor, type SignKind } from '../../catalog/domain/objectTypes';
import { chargeOf, priceOf } from '../../catalog/domain/prices';

// A factor on the list price per family, so a Villa in every style costs the same; a family left
// out is at list price.
export type Prices = { readonly [family: string]: number };

export const LIST_PRICES: Prices = {};

export const PRICE_RANGE = { min: 0.5, max: 2, step: 0.1 } as const;

// List price is what a three-star resort can ask; each star either side moves it by this much.
const FAIR_STARS = 3;
const FAIR_PER_STAR = 0.15;

// A bed priced a tenth above fair loses fifteen percent of the bookings.
const BOOKING_ELASTICITY = 1.5;
// Some guests book whatever the price, and a bargain cannot conjure up more than a busy summer.
const BOOKING_PULL = { min: 0.2, max: 1.3 } as const;

// Gentler than the beds: a guest already here pays a visit's price more readily than a night's.
const VENUE_ELASTICITY = 0.6;
// Never so dear that a venue empties, nor so cheap that it drains the one next door.
const VENUE_PULL = { min: 0.4, max: 1.25 } as const;

// A little over fair is a guest's grumble to keep to themselves.
const OVERPRICED_MARGIN = 0.2;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const STEPS_PER_UNIT = Math.round(1 / PRICE_RANGE.step);

// Multiplied, not divided by the step, so 1.15 rounds up and 1.1000000000000001 is never stored.
const toStep = (factor: number): number => Math.round(factor * STEPS_PER_UNIT) / STEPS_PER_UNIT;

export function setPrice(prices: Prices, family: string, factor: number | null): Prices {
  const { [family]: _old, ...rest } = prices;
  if (factor === null) return rest;
  const stepped = clamp(toStep(factor), PRICE_RANGE.min, PRICE_RANGE.max);
  return stepped === 1 ? rest : { ...rest, [family]: stepped };
}

export const factorOf = (prices: Prices, id: string): number => prices[familyOf(id)] ?? 1;

export const fairFactor = (stars: number): number => 1 + FAIR_PER_STAR * (stars - FAIR_STARS);

export function bookingPull(
  homes: readonly { readonly id: string; readonly beds: number }[],
  prices: Prices,
  stars: number,
): number {
  let beds = 0;
  let weighted = 0;
  for (const home of homes) {
    beds += home.beds;
    weighted += home.beds * factorOf(prices, home.id);
  }
  if (beds <= 0) return 1;
  const mean = weighted / beds;
  // List price never moves the bookings: good stars only buy room to raise it up to fair.
  const accepted = Math.max(1, fairFactor(stars));
  const off = mean > accepted ? mean - accepted : Math.min(0, mean - 1);
  return clamp(1 - BOOKING_ELASTICITY * off, BOOKING_PULL.min, BOOKING_PULL.max);
}

export const venuePull = (factor: number): number =>
  clamp(1 - VENUE_ELASTICITY * (factor - 1), VENUE_PULL.min, VENUE_PULL.max);

export const overpriced = (factor: number, stars: number): boolean =>
  factor > fairFactor(stars) + OVERPRICED_MARGIN;

export type PriceVerdict = 'cheap' | 'fair' | 'dear';

// Dear where the price starts to cost the resort: a bed loses bookings past what the stars accept,
// while a venue's visitors only grumble once it is well past that.
export function priceVerdict(
  row: { readonly role: PriceRow['role']; readonly factor: number },
  stars: number,
): PriceVerdict {
  if (row.factor < 1) return 'cheap';
  const dear =
    row.role === 'lodging'
      ? row.factor > Math.max(1, fairFactor(stars))
      : overpriced(row.factor, stars);
  return dear ? 'dear' : 'fair';
}

export interface PriceRow {
  readonly family: string;
  readonly label: string;
  readonly role: 'lodging' | 'venue';
  readonly sign: SignKind | null;
  readonly list: number;
  readonly charged: number;
  readonly factor: number;
}

const ORIGINALS = new Map(OBJECT_TYPES.map((type) => [type.id, type]));

export function priceRowsOf(ids: readonly string[], prices: Prices): readonly PriceRow[] {
  const rows = new Map<string, PriceRow>();
  for (const id of ids) {
    const family = familyOf(id);
    const original = ORIGINALS.get(family);
    const list = priceOf(family);
    if (rows.has(family) || !original?.venue || list <= 0) continue;
    const factor = factorOf(prices, family);
    rows.set(family, {
      family,
      label: original.label,
      role: original.venue.role === 'lodging' ? 'lodging' : 'venue',
      sign: signFor(original.venue),
      list,
      charged: chargeOf(family, factor),
      factor,
    });
  }
  return [...rows.values()].toSorted(
    (a, b) =>
      Number(a.role === 'venue') - Number(b.role === 'venue') || a.label.localeCompare(b.label),
  );
}

export interface PricesView {
  readonly rows: readonly PriceRow[];
  readonly fair: number;
  readonly pull: number;
  readonly stars: number;
}

export function pricesView(parts: {
  readonly placements: readonly { readonly id: string }[];
  readonly prices: Prices;
  readonly homes: readonly { readonly id: string; readonly beds: number }[];
  readonly stars: number;
}): PricesView {
  const { placements, prices, homes, stars } = parts;
  return {
    rows: priceRowsOf(
      placements.map((placement) => placement.id),
      prices,
    ),
    fair: fairFactor(stars),
    pull: bookingPull(homes, prices, stars),
    stars,
  };
}
