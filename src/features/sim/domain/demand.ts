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
  // Beds taken, or the most guests the line's venues held in an hour of the last day, waiting too.
  readonly used: number;
  readonly places: number;
  readonly turnedAway: number;
}

export interface Demand {
  readonly lines: { readonly [line in DemandLine]: Pressure };
  readonly groups: { readonly [group in DemandGroup]: DemandLine };
}

// Past three quarters full at its busiest, a line starts to want more: the rest is the slack a
// crowd needs, as walks bunch up and parties want tables together. A first cut, for tuning.
const COMFORTABLE = 0.75;

const clamp = (value: number): number => (value < -1 ? -1 : value > 1 ? 1 : value);

const fullness = (share: number): number => (share - COMFORTABLE) / (1 - COMFORTABLE);

const usable = (facts: ResortFacts, venue: Venue): boolean =>
  !facts.closed?.has(venue.key) &&
  !facts.shut?.has(venue.key) &&
  !facts.broken?.has(venue.key) &&
  !facts.unreachable.has(venue.key);

// A bar's splash of fun is no fun seat: a venue counts on the lines it mainly serves, or every
// table in the resort reads as room for thirst, fun and rest at once.
const MAIN_RELIEF = 0.5;

const servesMainly = (venue: Venue, need: GuestNeed): boolean => {
  const relief = reliefAt(venue, need);
  if (relief <= 0) return false;
  const most = Math.max(...venue.satisfies.map((each) => each.amount));
  return relief >= MAIN_RELIEF * most;
};

// Seats against the busiest they got, not wants against a throughput: guests spend most of an
// errand walking, so a headcount of wants never came near what even one snack bar serves.
function needPressure(facts: ResortFacts, need: GuestNeed): Pressure {
  let places = 0;
  let used = 0;
  let balks = 0;
  let visits = 0;
  for (const venue of facts.venues) {
    if (!servesMainly(venue, need) || !usable(facts, venue)) continue;
    places += venue.capacity;
    used += facts.busiest?.get(venue.key) ?? 0;
    balks += facts.balks.get(venue.key) ?? 0;
    visits += facts.visits.get(venue.key) ?? 0;
  }
  const turnedAway = balks + visits > 0 ? balks / (balks + visits) : 0;
  return {
    pressure: needLevel(facts, need, used, places, turnedAway),
    used: Math.round(used),
    places,
    turnedAway,
  };
}

function needLevel(
  facts: ResortFacts,
  need: GuestNeed,
  used: number,
  places: number,
  turnedAway: number,
): number {
  if (facts.present === 0) return 0;
  if (places === 0) return facts.wanting[need] > 0 ? 1 : 0;
  return liftedBy(fullness(used / places), turnedAway);
}

// Anybody turned away holds the bar at least at that share, however roomy it looks.
const liftedBy = (crowding: number, turnedAway: number): number =>
  clamp(turnedAway > 0 ? Math.max(crowding, turnedAway) : crowding);

// Bookings fill a good resort to the last bed by design, so a full house is no shortage: only
// the coach that found no bed, or a guest here without one, asks for more. An unmade bed is out
// of `bedsFree`, so it reads as taken, which building beds would not fix either.
function bedPressure(facts: ResortFacts): Pressure {
  const places = facts.bedsTotal ?? 0;
  const used = places - facts.bedsFree;
  const { wanted = 0, turnedAway: refused = 0 } = facts.bookings ?? {};
  const turnedAway = wanted > 0 ? refused / wanted : 0;
  if (places === 0) return { pressure: 1, used, places, turnedAway };
  const homeless = facts.present > 0 ? facts.homeless / facts.present : 0;
  const crowding = Math.min(0, fullness(used / places));
  return { pressure: liftedBy(crowding, Math.max(turnedAway, homeless)), used, places, turnedAway };
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
