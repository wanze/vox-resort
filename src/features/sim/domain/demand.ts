import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { ResortFacts } from './advice';
import { reliefAt, type Venue } from './venues';

export type DemandLine = 'beds' | GuestNeed;
export type DemandGroup = 'stay' | 'food' | 'fun' | 'care';

// Grouped by what the player would build, not by how the guests feel it.
export const DEMAND_GROUPS: { readonly [group in DemandGroup]: readonly DemandLine[] } = {
  stay: ['beds', 'energy'],
  food: ['hunger', 'thirst'],
  fun: ['fun'],
  care: ['hygiene', 'health'],
};

export interface Pressure {
  // -1 far more than wanted, 0 about right, +1 build more now.
  readonly pressure: number;
  readonly wanting: number;
  readonly places: number;
  readonly turnedAway: number;
}

export interface Demand {
  readonly lines: { readonly [line in DemandLine]: Pressure };
  readonly groups: { readonly [group in DemandGroup]: DemandLine };
}

// Past three quarters full, a night's arrivals (a seventh of the beds at most, as
// `ARRIVALS_SHARE` sizes them) start to be turned away. A first cut, for tuning.
const BEDS_COMFORTABLE = 0.75;

const clamp = (value: number): number => (value < -1 ? -1 : value > 1 ? 1 : value);

const usable = (facts: ResortFacts, venue: Venue): boolean =>
  !facts.closed?.has(venue.key) &&
  !facts.broken?.has(venue.key) &&
  !facts.unreachable.has(venue.key);

// The wanting are a headcount at this moment, so a place counts everyone it lets in within half
// an hour: a toilet free again in two minutes is fifteen, a table held longer still the one.
const SERVED_WITHIN = 30 * 60;

function turnsOf(venue: Venue): number {
  const { min, max } = venue.dwellSeconds;
  return Math.max(1, SERVED_WITHIN / ((min + max) / 2));
}

function needPressure(facts: ResortFacts, need: GuestNeed): Pressure {
  let room = 0;
  let balks = 0;
  let visits = 0;
  for (const venue of facts.venues) {
    if (reliefAt(venue, need) <= 0 || !usable(facts, venue)) continue;
    room += venue.capacity * turnsOf(venue);
    balks += facts.balks.get(venue.key) ?? 0;
    visits += facts.visits.get(venue.key) ?? 0;
  }
  const places = Math.round(room);
  const wanting = facts.wanting[need];
  const turnedAway = balks + visits > 0 ? balks / (balks + visits) : 0;
  return {
    pressure: needLevel(facts.present, wanting, places, turnedAway),
    wanting,
    places,
    turnedAway,
  };
}

function needLevel(present: number, wanting: number, places: number, turnedAway: number): number {
  if (present === 0) return 0;
  if (places === 0) return wanting > 0 ? 1 : 0;
  return liftedBy(wanting / places - 1, turnedAway);
}

// Anybody turned away holds the bar at least at that share, however roomy it looks.
const liftedBy = (crowding: number, turnedAway: number): number =>
  clamp(turnedAway > 0 ? Math.max(crowding, turnedAway) : crowding);

// An unmade bed is out of `bedsFree`, so it reads as taken: building beds is not
// the fix for it, but the bar must not say there is room either.
function bedPressure(facts: ResortFacts): Pressure {
  const places = facts.bedsTotal ?? 0;
  const occupied = places - facts.bedsFree;
  const turnedAway = facts.present > 0 ? facts.homeless / facts.present : 0;
  const wanting = occupied + facts.homeless;
  if (places === 0) return { pressure: 1, wanting, places, turnedAway };
  const crowding = (occupied / places - BEDS_COMFORTABLE) / (1 - BEDS_COMFORTABLE);
  return { pressure: liftedBy(crowding, turnedAway), wanting, places, turnedAway };
}

function loudestOf(lines: Demand['lines'], group: DemandGroup): DemandLine {
  const [first, ...rest] = DEMAND_GROUPS[group];
  let loudest = first!;
  for (const line of rest) if (lines[line].pressure > lines[loudest].pressure) loudest = line;
  return loudest;
}

export function demandFor(facts: ResortFacts): Demand {
  const lines = {
    beds: bedPressure(facts),
    hunger: needPressure(facts, 'hunger'),
    thirst: needPressure(facts, 'thirst'),
    energy: needPressure(facts, 'energy'),
    fun: needPressure(facts, 'fun'),
    hygiene: needPressure(facts, 'hygiene'),
    health: needPressure(facts, 'health'),
  };
  return {
    lines,
    groups: {
      stay: loudestOf(lines, 'stay'),
      food: loudestOf(lines, 'food'),
      fun: loudestOf(lines, 'fun'),
      care: loudestOf(lines, 'care'),
    },
  };
}
