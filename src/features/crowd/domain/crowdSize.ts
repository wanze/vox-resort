// The authored resort was designed around 600 people over its 2 398 paved tiles.
const PEOPLE_PER_PAVED_TILE = 0.25;

export const MAX_CROWD = 10_000;

export function crowdSizeFor(pavedTiles: number, override: number | null = null): number {
  if (override !== null) return Math.min(MAX_CROWD, Math.max(0, Math.floor(override)));
  return Math.min(MAX_CROWD, Math.round(Math.max(0, pavedTiles) * PEOPLE_PER_PAVED_TILE));
}

// What the generator paves: 2 237 to 2 297 of 11 200 tiles on seeds 1-7, so a plot built by hand
// is dealt about the guests a generated plot of its size would hold.
const PAVED_SHARE = 0.2;

export function crowdSizeForArea(
  tilesX: number,
  tilesZ: number,
  override: number | null = null,
): number {
  const paved = Math.round(Math.max(0, tilesX) * Math.max(0, tilesZ) * PAVED_SHARE);
  return crowdSizeFor(paved, override);
}

export function crowdOverrideFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('people');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
