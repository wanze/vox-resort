import { TICKS_PER_DAY } from './simClock';
import type { Venue } from './venues';

const TICKS_PER_HOUR = TICKS_PER_DAY / 24;

// By venue key, the most guests it held in each hour of the last day, inside and in the line
// together: the bar answers to the busiest meal of the day, not to whatever this minute is.
export interface VenueUse {
  hour: number;
  readonly byKey: Map<string, Float32Array>;
}

export const createVenueUse = (): VenueUse => ({ hour: -1, byKey: new Map() });

// Hours skipped in one call are cleared too, so a fast night does not keep yesterday's crowd.
function turnTo(use: VenueUse, hour: number): void {
  if (hour === use.hour) return;
  // A clock that ran backwards was loaded from a save, and nothing counted since is about it.
  const passed = hour < use.hour ? 24 : Math.min(24, hour - use.hour);
  for (const hours of use.byKey.values()) {
    for (let step = 1; step <= passed; step++) hours[(hour - passed + step + 24) % 24] = 0;
  }
  use.hour = hour;
}

export function noteUse(
  use: VenueUse,
  venues: readonly Venue[],
  busyAt: (venue: number) => number,
  ticks: number,
): void {
  const hour = Math.floor(ticks / TICKS_PER_HOUR);
  turnTo(use, hour);
  const slot = hour % 24;
  for (let index = 0; index < venues.length; index++) {
    const { key } = venues[index]!;
    let hours = use.byKey.get(key);
    if (!hours) {
      hours = new Float32Array(24);
      use.byKey.set(key, hours);
    }
    const now = busyAt(index);
    if (now > hours[slot]!) hours[slot] = now;
  }
  if (use.byKey.size > venues.length) forgetDemolished(use, venues);
}

function forgetDemolished(use: VenueUse, venues: readonly Venue[]): void {
  const standing = new Set(venues.map((venue) => venue.key));
  for (const key of use.byKey.keys()) if (!standing.has(key)) use.byKey.delete(key);
}

export function busiestOf(use: VenueUse): ReadonlyMap<string, number> {
  const busiest = new Map<string, number>();
  for (const [key, hours] of use.byKey) busiest.set(key, Math.max(...hours));
  return busiest;
}
