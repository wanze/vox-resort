/**
 * How many people a resort gets.
 *
 * From its paving, because paving is what people walk: a plot nine times the
 * area with the same six hundred people on it reads as a ghost town, and a
 * stress test that leaves the crowd out of the stress is not one. The rate is
 * what the authored resort was designed around — six hundred people over its
 * 2 398 paved tiles — so that plot keeps the crowd it always had.
 *
 * `?people=n` overrides it, for pricing the crowd on its own.
 */

/** People per paved tile. */
const PEOPLE_PER_PAVED_TILE = 0.25;

/** The most people any resort gets, however much paving it has. */
export const MAX_CROWD = 10_000;

export function crowdSizeFor(pavedTiles: number, override: number | null = null): number {
  if (override !== null) return Math.min(MAX_CROWD, Math.max(0, Math.floor(override)));
  return Math.min(MAX_CROWD, Math.round(Math.max(0, pavedTiles) * PEOPLE_PER_PAVED_TILE));
}

/** The `people` parameter of a query string, or null when it is absent or not a count. */
export function crowdOverrideFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('people');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
