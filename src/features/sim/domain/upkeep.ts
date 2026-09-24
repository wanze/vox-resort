// There is deliberately no decay back towards clean: the answer to dirt is a cleaner walking to it.

export interface Upkeep {
  readonly venues: number;
  // 1 spotless, 0 filthy.
  readonly level: Float32Array;
}

// Spotless to filthy in about five hundred covers: days of a busy plot, not an afternoon.
export const WEAR_PER_VISIT = 0.02;

// Three spells restore filthy to spotless, so one cleaner can hold two or three venues and no more.
export const SCRUB_PER_SPELL = 0.35;

// Higher, and cleaners would top up nearly clean venues while the filthy one went untouched.
export const NEEDS_CLEANING = 0.7;

export function createUpkeep(venues: number): Upkeep {
  const count = Math.max(0, venues);
  return { venues: count, level: new Float32Array(count).fill(1) };
}

// Divided by capacity: a capacity says how many the place is built for, not how busy it is.
export function soil(upkeep: Upkeep, venue: number, capacity: number): void {
  const level = upkeep.level[venue];
  if (level === undefined) return;
  const worn = level - WEAR_PER_VISIT / Math.max(1, capacity);
  upkeep.level[venue] = worn < 0 ? 0 : worn;
}

export function scrub(upkeep: Upkeep, venue: number, amount: number): void {
  const level = upkeep.level[venue];
  if (level === undefined) return;
  const cleaned = level + amount;
  upkeep.level[venue] = cleaned > 1 ? 1 : cleaned;
}

// Spotless outside the array: the router's synthetic beach sits past the end of the venue list.
export function cleanliness(upkeep: Upkeep, venue: number): number {
  return upkeep.level[venue] ?? 1;
}

// Ties break towards the lower index so two runs of the same plot agree.
export function dirtiest(
  upkeep: Upkeep,
  eligible: (venue: number) => boolean,
  threshold: number,
): number {
  let worst = -1;
  let worstLevel = threshold;
  for (let venue = 0; venue < upkeep.venues; venue++) {
    const level = upkeep.level[venue]!;
    if (level >= worstLevel) continue;
    if (!eligible(venue)) continue;
    worst = venue;
    worstLevel = level;
  }
  return worst;
}

// Carried by venue key, since indices mean nothing across a rebuild.
export function carryUpkeep(
  previous: Upkeep,
  from: readonly { readonly key: string }[],
  to: readonly { readonly key: string }[],
): Upkeep {
  const carried = createUpkeep(to.length);
  const was = new Map(from.map((venue, index) => [venue.key, previous.level[index] ?? 1]));
  for (let venue = 0; venue < to.length; venue++) {
    carried.level[venue] = was.get(to[venue]!.key) ?? 1;
  }
  return carried;
}
