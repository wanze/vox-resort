import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { ARCHETYPES } from './archetypes';
import type { VenueDoors } from './doors';
import type { LitterSummary } from './litter';
import type { Lodging } from './lodgings';
import { NEEDS } from './needs';
import { NEEDS_CLEANING } from './upkeep';
import { reliefAt, type Venue } from './venues';

export type AdviceKind =
  | 'closed'
  | 'no-entrance'
  | 'no-reception'
  | 'no-beds'
  | 'unserved-need'
  | 'full-lines'
  | 'unreachable'
  | 'dirty'
  | 'littered'
  | 'far-from-home'
  | 'unvisited'
  | 'weather-closed';

export interface Advice {
  readonly kind: AdviceKind;
  readonly weight: number;
  readonly subject: string;
  readonly count: number;
  // A label is not an address: a plot stands many Changing Cabins, and the tile tells them apart.
  readonly at: { readonly tileX: number; readonly tileZ: number } | null;
  readonly need: GuestNeed | null;
}

const tileOf = (place: { readonly tileX: number; readonly tileZ: number }) => ({
  tileX: place.tileX,
  tileZ: place.tileZ,
});

// Advice only ranks facts others counted. A rule that seems to need a change in
// `chooseVenue.ts` or `occupancy.ts` has found a bug there instead.
export interface ResortFacts {
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly present: number;
  readonly homeless: number;
  readonly bedsFree: number;
  readonly wanting: { readonly [need in GuestNeed]: number };
  readonly balks: ReadonlyMap<string, number>;
  readonly visits: ReadonlyMap<string, number>;
  readonly unreachable: ReadonlySet<string>;
  // A key with no entry is spotless.
  readonly cleanliness: ReadonlyMap<string, number>;
  // Absent means a clear day.
  readonly closed?: ReadonlySet<string>;
  // Absent means the resort is open, reachable and checking guests in.
  readonly open?: boolean;
  readonly entrance?: boolean;
  readonly reception?: boolean;
  readonly bedsTotal?: number;
  // Absent means clean paths.
  readonly litter?: LitterSummary;
}

// Declared so advice of equal weight comes out in the same order on every run.
const KIND_ORDER: readonly AdviceKind[] = [
  // First: nothing else matters while nobody can come.
  'closed',
  'no-entrance',
  'no-reception',
  'no-beds',
  'unserved-need',
  'full-lines',
  'unreachable',
  'dirty',
  'littered',
  'far-from-home',
  'unvisited',
  // Last: the one line the player cannot fix today.
  'weather-closed',
];

const clamp = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

// Fifty balks in a day is a place plainly too small.
const BALKS_LOUD = 50;

// Twenty fouled tiles is a promenade, not a corner: past it the plot plainly needs bins.
const LITTER_LOUD = 20;

// Same value as `IDLE_ROOMY` but not shared: the two rules need not move together.
const ROOMY = 40;

// The smallest reach in the table: past it, families stop eating. The weight is
// scaled against the widest reach so a distance nobody walks comes out at 1.
const TOO_FAR = ARCHETYPES.family.reach;
const REACH_SCALE = ARCHETYPES.friends.reach;

// Softened where beds stand free: the capacity is there and only the rooming is wrong.
export function adviceNoBeds(facts: ResortFacts): Advice | null {
  if (facts.homeless <= 0) return null;
  const share = clamp(facts.homeless / facts.present);
  return {
    kind: 'no-beds',
    weight: facts.bedsFree > 0 ? share * 0.6 : share,
    subject: 'beds',
    count: facts.homeless,
    at: null,
    need: null,
  };
}

// Silent about a need nobody wants yet: that is a new plot, not a badly built one.
export function adviceUnservedNeeds(facts: ResortFacts): readonly Advice[] {
  const advice: Advice[] = [];
  for (const need of NEEDS) {
    const wanting = facts.wanting[need];
    if (wanting <= 0) continue;
    if (facts.venues.some((venue) => reliefAt(venue, need) > 0)) continue;
    advice.push({
      kind: 'unserved-need',
      weight: clamp(wanting / facts.present),
      subject: need,
      count: wanting,
      at: null,
      need,
    });
  }
  return advice;
}

export function adviceFullLines(facts: ResortFacts): Advice | null {
  let worst: Advice | null = null;
  for (const venue of facts.venues) {
    const balks = facts.balks.get(venue.key) ?? 0;
    if (balks <= 0) continue;
    const arrivals = balks + (facts.visits.get(venue.key) ?? 0);
    const weight = clamp(balks / arrivals) * clamp(balks / BALKS_LOUD);
    if (worst === null || weight > worst.weight) {
      worst = {
        kind: 'full-lines',
        weight,
        subject: venue.label,
        count: balks,
        at: tileOf(venue),
        need: null,
      };
    }
  }
  return worst;
}

// Silent above `NEEDS_CLEANING`, the same line the cleaners walk to: advice observes.
export function adviceDirty(facts: ResortFacts): Advice | null {
  let worst: Advice | null = null;
  for (const venue of facts.venues) {
    const clean = facts.cleanliness.get(venue.key) ?? 1;
    if (clean >= NEEDS_CLEANING) continue;
    const weight = clamp((NEEDS_CLEANING - clean) / NEEDS_CLEANING) * clamp(venue.capacity / ROOMY);
    if (worst === null || weight > worst.weight) {
      worst = {
        kind: 'dirty',
        weight,
        subject: venue.label,
        // The percentage the inspector shows, so the two panels agree.
        count: Math.round(clean * 100),
        at: tileOf(venue),
        need: null,
      };
    }
  }
  return worst;
}

export function adviceLittered(facts: ResortFacts): Advice | null {
  const litter = facts.litter;
  if (!litter || litter.fouled <= 0) return null;
  return {
    kind: 'littered',
    weight: clamp(litter.worstLevel) * clamp(litter.fouled / LITTER_LOUD),
    subject: 'litter',
    count: litter.fouled,
    at: litter.worst,
    need: null,
  };
}

export function adviceUnreachable(facts: ResortFacts): readonly Advice[] {
  return facts.venues
    .filter((venue) => facts.unreachable.has(venue.key))
    .map((venue) => ({
      kind: 'unreachable' as const,
      weight: 0.9,
      subject: venue.label,
      count: venue.capacity,
      at: tileOf(venue),
      need: null,
    }));
}

// Straight line on purpose: a flow field per lodging per need is the eager sweep
// `router.ts` refuses to do.
export function adviceFarFromHome(facts: ResortFacts): Advice | null {
  let furthest = 0;
  let worst: { readonly lodging: Lodging; readonly need: GuestNeed } | null = null;
  for (const lodging of facts.lodgings) {
    for (const need of NEEDS) {
      const distance = nearestServing(facts.venues, need, lodging);
      if (distance === null || distance <= TOO_FAR || distance <= furthest) continue;
      furthest = distance;
      worst = { lodging, need };
    }
  }
  // Ranked on distance, not the clamped weight: on the reference plot a dozen
  // lodgings all weigh 1.
  if (!worst) return null;
  return {
    kind: 'far-from-home',
    weight: clamp(furthest / REACH_SCALE),
    subject: worst.lodging.label,
    count: Math.round(furthest / TILE_VOXELS),
    at: tileOf(worst.lodging),
    need: worst.need,
  };
}

function nearestServing(
  venues: readonly Venue[],
  need: GuestNeed,
  from: { readonly x: number; readonly z: number },
): number | null {
  let nearest: number | null = null;
  for (const venue of venues) {
    if (reliefAt(venue, need) <= 0) continue;
    const distance = Math.hypot(venue.x - from.x, venue.z - from.z);
    if (nearest === null || distance < nearest) nearest = distance;
  }
  return nearest;
}

// Scaled by size rather than flat, or which idle venues reach the panel comes down
// to placement order. Kept below `adviceUnreachable`'s 0.9.
const IDLE_LOUDEST = 0.4;
const IDLE_ROOMY = 40;

const idleWeight = (capacity: number): number =>
  0.2 + (IDLE_LOUDEST - 0.2) * clamp(capacity / IDLE_ROOMY);

// Silent until somebody has been somewhere: a fresh plot's empty counters would
// read as every building standing idle.
export function adviceUnvisited(facts: ResortFacts): readonly Advice[] {
  if (facts.visits.size === 0) return [];
  return facts.venues
    .filter(
      (venue) => !facts.unreachable.has(venue.key) && (facts.visits.get(venue.key) ?? 0) === 0,
    )
    .map((venue) => ({
      kind: 'unvisited' as const,
      weight: idleWeight(venue.capacity),
      subject: venue.label,
      count: venue.capacity,
      at: tileOf(venue),
      need: null,
    }));
}

// Both halves: a beach building has no door node but is reachable over the sand.
// Sand routes are not swept per building; that costs too much for too little.
export function unreachableOn(
  venues: readonly Venue[],
  doorsOf: (venue: Venue) => VenueDoors,
): ReadonlySet<string> {
  const stranded = new Set<string>();
  for (const venue of venues) {
    const doors = doorsOf(venue);
    if (doors.nodes.length === 0 && doors.sand.length === 0) stranded.add(venue.key);
  }
  return stranded;
}

const NOWHERE = { tileX: 0, tileZ: 0 } as const;

const spotOf = (advice: Advice): { readonly tileX: number; readonly tileZ: number } =>
  advice.at ?? NOWHERE;

// A total order, or equal weights would leave the panel to the sort's tie-breaking.
function louderFirst(a: Advice, b: Advice): number {
  return (
    b.weight - a.weight ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    spotOf(a).tileZ - spotOf(b).tileZ ||
    spotOf(a).tileX - spotOf(b).tileX
  );
}

// Reports the hole the rain leaves, not the rain: needs with over half their relief shut.
export function adviceWeatherClosed(facts: ResortFacts): readonly Advice[] {
  const closed = facts.closed;
  if (!closed || closed.size === 0) return [];
  const advice: Advice[] = [];
  for (const need of NEEDS) {
    const wanting = facts.wanting[need];
    if (wanting <= 0) continue;
    const serving = facts.venues.filter((venue) => reliefAt(venue, need) > 0);
    if (serving.length === 0) continue;
    const shut = serving.filter((venue) => closed.has(venue.key)).length;
    if (shut * 2 <= serving.length) continue;
    advice.push({
      kind: 'weather-closed',
      weight: clamp(wanting / facts.present) * clamp(shut / serving.length),
      subject: need,
      count: shut,
      at: null,
      need,
    });
  }
  return advice;
}

const nobodyComes = (kind: AdviceKind, subject: string): Advice => ({
  kind,
  weight: 1,
  subject,
  count: 0,
  at: null,
  need: null,
});

// Closed says nothing until there is a bed to come to: a bare plot is not ready to open.
export function adviceNobodyComes(facts: ResortFacts): Advice | null {
  if (facts.open === false) {
    return (facts.bedsTotal ?? 0) > 0 ? nobodyComes('closed', 'resort') : null;
  }
  if (facts.entrance === false) return nobodyComes('no-entrance', 'entrance');
  if (facts.reception === false) return nobodyComes('no-reception', 'reception');
  return null;
}

// Why nobody comes is asked first, as a new plot never has anybody present. Otherwise a plot
// with nobody on it says nothing, which also keeps the divisions below safe.
export function adviceFor(facts: ResortFacts): readonly Advice[] {
  const gate = adviceNobodyComes(facts);
  if (facts.present <= 0) return gate ? [gate] : [];
  const found = [
    gate,
    adviceNoBeds(facts),
    ...adviceUnservedNeeds(facts),
    adviceFullLines(facts),
    ...adviceUnreachable(facts),
    adviceDirty(facts),
    adviceLittered(facts),
    adviceFarFromHome(facts),
    ...adviceUnvisited(facts),
    ...adviceWeatherClosed(facts),
  ].filter((advice): advice is Advice => advice !== null && advice.weight > 0);
  return found.toSorted(louderFirst);
}
