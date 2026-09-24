// The authored resort was designed around 600 people over its 2 398 paved tiles.
const PEOPLE_PER_PAVED_TILE = 0.25;

export const MAX_CROWD = 10_000;

export function crowdSizeFor(pavedTiles: number, override: number | null = null): number {
  if (override !== null) return Math.min(MAX_CROWD, Math.max(0, Math.floor(override)));
  return Math.min(MAX_CROWD, Math.round(Math.max(0, pavedTiles) * PEOPLE_PER_PAVED_TILE));
}

export function crowdOverrideFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('people');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
