import { mix } from '../../random/domain/hash';
import type { BreakdownsSnapshot } from './resortSnapshot';

export interface Breakdowns {
  readonly venues: number;
  readonly broken: Uint8Array;
  // The tick it broke, so the advice can say how long it has been down.
  readonly since: Int32Array;
  readonly worn: Int32Array;
}

export function createBreakdowns(venues: number): Breakdowns {
  const count = Math.max(0, venues);
  return {
    venues: count,
    broken: new Uint8Array(count),
    since: new Int32Array(count),
    worn: new Int32Array(count),
  };
}

// Drawn by hash rather than from a seeded stream, so a breakdown moves no other draw. imul, not
// a plain product: past 2^53 the product swallows the visit count and every draw repeats.
export function wear(
  breakdowns: Breakdowns,
  venue: number,
  reliability: number | undefined,
  salt: number,
  now: number,
): boolean {
  if (venue < 0 || venue >= breakdowns.venues || breakdowns.broken[venue] === 1) return false;
  const worn = breakdowns.worn[venue]! + 1;
  breakdowns.worn[venue] = worn;
  if (reliability === undefined) return false;
  const odds = Math.max(1, Math.round(reliability));
  if (mix(Math.imul(salt, 2_654_435_761) + worn) % odds !== 0) return false;
  breakdowns.broken[venue] = 1;
  breakdowns.since[venue] = now;
  return true;
}

export function repair(breakdowns: Breakdowns, venue: number): void {
  if (venue < 0 || venue >= breakdowns.venues) return;
  breakdowns.broken[venue] = 0;
  breakdowns.since[venue] = 0;
}

// Sound outside the array: the router's synthetic beach sits past the end of the venue list.
export function isBroken(breakdowns: Breakdowns, venue: number): boolean {
  return breakdowns.broken[venue] === 1;
}

// Ties break towards the lower index so two runs of the same plot agree.
export function brokenFirst(breakdowns: Breakdowns, eligible: (venue: number) => boolean): number {
  let first = -1;
  for (let venue = 0; venue < breakdowns.venues; venue++) {
    if (breakdowns.broken[venue] !== 1) continue;
    if (first >= 0 && breakdowns.since[venue]! >= breakdowns.since[first]!) continue;
    if (eligible(venue)) first = venue;
  }
  return first;
}

// Carried by venue key, since indices mean nothing across a rebuild.
export function carryBreakdowns(
  previous: Breakdowns,
  from: readonly { readonly key: string }[],
  to: readonly { readonly key: string }[],
): Breakdowns {
  const carried = createBreakdowns(to.length);
  const was = new Map(from.map((venue, index) => [venue.key, index]));
  for (let venue = 0; venue < to.length; venue++) {
    const index = was.get(to[venue]!.key);
    if (index === undefined || index >= previous.venues) continue;
    carried.broken[venue] = previous.broken[index]!;
    carried.since[venue] = previous.since[index]!;
    carried.worn[venue] = previous.worn[index]!;
  }
  return carried;
}

export function snapshotBreakdowns(
  breakdowns: Breakdowns,
  venues: readonly { readonly key: string }[],
): BreakdownsSnapshot {
  return {
    keys: venues.map((venue) => venue.key),
    broken: breakdowns.broken.slice(),
    since: breakdowns.since.slice(),
    worn: breakdowns.worn.slice(),
  };
}

export function restoreBreakdowns(
  snapshot: BreakdownsSnapshot,
  venues: readonly { readonly key: string }[],
): Breakdowns {
  const saved = { ...snapshot, venues: snapshot.keys.length };
  return carryBreakdowns(
    saved,
    snapshot.keys.map((key) => ({ key })),
    venues,
  );
}
