import { namesOf, objectTypeById, venueOf } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { saltFor } from '../../sim/domain/appeal';
import { cleanName, FIRSTS } from './resortName';

// Placement key to name. A venue with no entry goes by its type.
export type VenueNames = ReadonlyMap<string, string>;

export const MAX_VENUE_NAME = 24;

export interface NamedPlace {
  readonly key: string;
  readonly tileX: number;
  readonly tileZ: number;
  // The type's label, for the fallbacks once the suggestions run out.
  readonly kind: string;
  readonly suggestions: readonly string[];
}

// The venues venuesOn makes, with what a draw needs to know about each.
export function namedPlacesOf(placements: readonly Placement[]): NamedPlace[] {
  return placements
    .filter((placement) => {
      const venue = venueOf(placement.id);
      return venue !== null && venue.role !== 'lodging';
    })
    .map((placement) => ({
      key: placement.key,
      tileX: placement.tileX,
      tileZ: placement.tileZ,
      kind: objectTypeById(placement.id).label,
      suggestions: namesOf(placement.id),
    }));
}

const cleanVenueName = (typed: string): string | null => cleanName(typed, MAX_VENUE_NAME);

const folded = (name: string): string => name.toLowerCase();

function fallbackFor(place: NamedPlace, taken: ReadonlySet<string>): string {
  const free = (name: string) => !taken.has(folded(name)) && name.length <= MAX_VENUE_NAME;
  const worded = FIRSTS.map((word) => `${word} ${place.kind}`).find(free);
  if (worded) return worded;
  let number = 2;
  while (taken.has(folded(`${place.kind} ${number}`))) number++;
  return `${place.kind} ${number}`;
}

// Generated plots reuse keys like `restaurant#2` on every seed, so the tile is hashed too.
function drawName(place: NamedPlace, taken: ReadonlySet<string>): string {
  const { suggestions } = place;
  const start = (saltFor(`${place.key}@${place.tileX},${place.tileZ}`) >>> 0) % suggestions.length;
  for (let step = 0; step < suggestions.length; step++) {
    const name = suggestions[(start + step) % suggestions.length]!;
    if (!taken.has(folded(name))) return name;
  }
  return fallbackFor(place, taken);
}

const byKey = (a: NamedPlace, b: NamedPlace): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

// Never changes a name already held, so building a second restaurant leaves the first alone.
export function assignNames(held: VenueNames, standing: readonly NamedPlace[]): VenueNames {
  const keys = new Set(standing.map((place) => place.key));
  const names = new Map([...held].filter(([key]) => keys.has(key)));
  const taken = new Set([...names.values()].map(folded));
  const unnamed = standing
    .filter((place) => !names.has(place.key) && place.suggestions.length > 0)
    .toSorted(byKey);
  for (const place of unnamed) {
    const name = drawName(place, taken);
    names.set(place.key, name);
    taken.add(folded(name));
  }
  return names;
}

// Random rather than the hash, which would hand back the same two names turn about.
function rerollName(held: VenueNames, place: NamedPlace, random: () => number): VenueNames {
  const names = new Map(held);
  const current = names.get(place.key);
  names.delete(place.key);
  if (place.suggestions.length === 0) return names;
  const taken = new Set([...names.values()].map(folded));
  const fresh = place.suggestions.filter((name) => !taken.has(folded(name)) && name !== current);
  const name =
    fresh.length > 0
      ? fresh[Math.floor(random() * fresh.length) % fresh.length]!
      : fallbackFor(place, current === undefined ? taken : taken.add(folded(current)));
  names.set(place.key, name);
  return names;
}

// Kept as typed, even a name another venue holds: only the draw avoids those. An emptied name
// draws a fresh one, or goes back to the kind where the model suggests none.
export function renameTo(
  held: VenueNames,
  place: NamedPlace,
  typed: string,
  random: () => number,
): VenueNames {
  const cleaned = cleanVenueName(typed);
  return cleaned === null ? rerollName(held, place, random) : new Map(held).set(place.key, cleaned);
}
