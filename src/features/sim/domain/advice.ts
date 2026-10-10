import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import { GUEST_NEEDS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { ARCHETYPES } from './archetypes';
import type { VenueDoors } from './doors';
import type { LitterSummary } from './litter';
import type { Lodging } from './lodgings';
import type { Shortfall } from './staff';
import { NEEDS_CLEANING } from './upkeep';
import { reliefAt, type Venue } from './venues';

// Declared so advice of equal weight comes out in the same order on every run.
const KIND_ORDER = [
  // First: nothing else matters while nobody can come.
  'closed',
  'no-entrance',
  'no-reception',
  'no-beds',
  'unmade',
  'hurt',
  'unserved-need',
  'full-lines',
  'unreachable',
  'not-step-free',
  // Above the lines a short roster causes, so the cause reads before its symptoms.
  'short-staffed',
  'broken',
  'dirty',
  'unwatched',
  'littered',
  'far-from-home',
  'no-depot',
  'unvisited',
  'no-events',
  'no-welcome',
  'no-fireworks',
  // Last: the one line the player cannot fix today.
  'weather-closed',
] as const;

export type AdviceKind = (typeof KIND_ORDER)[number];

export interface Advice {
  readonly kind: AdviceKind;
  readonly weight: number;
  readonly subject: string;
  readonly count: number;
  // A label is not an address: a plot stands many Changing Cabins, and the tile tells them apart.
  readonly at: { readonly tileX: number; readonly tileZ: number } | null;
  readonly need: GuestNeed | null;
  // The venue's placement key, which a rename leaves alone where the subject changes.
  readonly key?: string;
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
  // Venue and lodging keys alike.
  readonly unreachable: ReadonlySet<string>;
  // A key with no entry is spotless.
  readonly cleanliness: ReadonlyMap<string, number>;
  // Absent means a clear day.
  readonly closed?: ReadonlySet<string>;
  // Shut by their hours now; absent means none.
  readonly shut?: ReadonlySet<string>;
  // Absent means the resort is open, reachable and checking guests in.
  readonly open?: boolean;
  readonly entrance?: boolean;
  readonly reception?: boolean;
  readonly bedsTotal?: number;
  // Freed by a check-out and waiting for a cleaner; absent means every bed is made up.
  readonly bedsUnmade?: number;
  // Absent means clean paths.
  readonly litter?: LitterSummary;
  // Keys of the water nobody watches; absent means every pool has its lifeguard.
  readonly unwatched?: ReadonlySet<string>;
  // Key to ticks since it broke; absent means nothing is broken.
  readonly broken?: ReadonlyMap<string, number>;
  // Guests here now with their health below full.
  readonly hurt?: number;
  // Hand-set roles below what the plot wants; absent means every role is on Auto or enough.
  readonly shortStaffed?: readonly Shortfall[];
  // Absent means the plot's staff houses were not counted, which says nothing.
  readonly depots?: number;
  readonly cleanersOnDuty?: number;
  // Reached from the gates on foot but not in a wheelchair; absent means every one is step-free.
  readonly notStepFree?: readonly Venue[];
  // A stage to point at when no stage has anything on in the next seven days; absent or null
  // means something is booked, or there is no stage.
  readonly idleStage?: Venue | null;
  // Today's arrivals while no stage stands to welcome them on; absent or 0 says nothing.
  readonly welcomeless?: number;
  // The beach, when two weeks went by with no fireworks and none is booked; absent or null
  // says nothing.
  readonly quietBeach?: Venue | null;
}

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

// A quarter of the beds waiting is as loud as it gets: that is a quarter of the plot unsellable.
export function adviceUnmade(facts: ResortFacts): Advice | null {
  const unmade = facts.bedsUnmade ?? 0;
  if (unmade <= 0) return null;
  return {
    kind: 'unmade',
    weight: 0.2 + 0.6 * clamp((4 * unmade) / Math.max(1, facts.bedsTotal ?? unmade)),
    subject: 'beds',
    count: unmade,
    at: null,
    need: null,
  };
}

// Health too: somebody hurt with no first aid on the plot is a need nothing serves.
const SERVED_NEEDS: readonly GuestNeed[] = [...GUEST_NEEDS, 'health'];

// Silent about a need nobody wants yet: that is a new plot, not a badly built one.
export function adviceUnservedNeeds(facts: ResortFacts): readonly Advice[] {
  const advice: Advice[] = [];
  for (const need of SERVED_NEEDS) {
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
        key: venue.key,
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
        key: venue.key,
        // The percentage the inspector shows, so the two panels agree.
        count: Math.round(clean * 100),
        at: tileOf(venue),
        need: null,
      };
    }
  }
  return worst;
}

// An unused pool nobody watches is not urgent, so the weight follows today's swimmers.
const SWIMMERS_LOUD = 40;

export function adviceUnwatched(facts: ResortFacts): readonly Advice[] {
  const advice: Advice[] = [];
  for (const key of facts.unwatched ?? []) {
    // Only the beach is missing from the venue list: it is terrain, not a building.
    const venue = facts.venues.find((each) => each.key === key);
    const swam = facts.visits.get(key) ?? 0;
    advice.push({
      kind: 'unwatched',
      weight: 0.1 + 0.6 * clamp(swam / SWIMMERS_LOUD),
      subject: venue?.label ?? 'the beach',
      ...(venue ? { key: venue.key } : {}),
      count: swam,
      at: venue ? tileOf(venue) : null,
      need: null,
    });
  }
  return advice;
}

// Three simulated hours down is as loud as a breakdown gets: by then a mechanic should have come.
const DOWN_LOUD = 180;

// Never silent: a broken venue turns every guest away, however briefly.
export function adviceBroken(facts: ResortFacts): readonly Advice[] {
  const broken = facts.broken;
  if (!broken || broken.size === 0) return [];
  return facts.venues
    .filter((venue) => broken.has(venue.key))
    .map((venue) => {
      const down = Math.max(0, broken.get(venue.key)!);
      return {
        kind: 'broken' as const,
        weight: 0.3 + 0.6 * clamp(down / DOWN_LOUD),
        subject: venue.label,
        key: venue.key,
        count: down,
        at: tileOf(venue),
        need: null,
      };
    });
}

// Ten hurt at once is a plot with a problem, not bad luck.
const HURT_LOUD = 10;

// Says nothing about first aid: where there is none, the unserved need already says so.
export function adviceHurt(facts: ResortFacts): Advice | null {
  const hurt = facts.hurt ?? 0;
  if (hurt <= 0) return null;
  return {
    kind: 'hurt',
    weight: 0.2 + 0.5 * clamp(hurt / HURT_LOUD),
    subject: 'injuries',
    count: hurt,
    at: null,
    need: null,
  };
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

// A stranded lodging's count is its beds, which check-in leaves empty until a path reaches it.
export function adviceUnreachable(facts: ResortFacts): readonly Advice[] {
  const places = [
    ...facts.venues.map((venue) => ({ place: venue, count: venue.capacity })),
    ...facts.lodgings.map((lodging) => ({ place: lodging, count: lodging.beds })),
  ];
  return places
    .filter(({ place }) => facts.unreachable.has(place.key))
    .map(({ place, count }) => ({
      kind: 'unreachable' as const,
      weight: 0.9,
      subject: place.label,
      key: place.key,
      count,
      at: tileOf(place),
      need: null,
    }));
}

// One line for them all, at the first: a resort with stairs everywhere is one problem, not twenty.
// Below the unreachable, as a stranded building fails everybody and this a few.
export function adviceNotStepFree(facts: ResortFacts): Advice | null {
  const cutOff = facts.notStepFree ?? [];
  const first = cutOff[0];
  if (!first) return null;
  return {
    kind: 'not-step-free',
    weight: 0.3 + 0.3 * clamp(cutOff.length / Math.max(1, facts.venues.length)),
    subject: first.label,
    key: first.key,
    count: cutOff.length,
    at: tileOf(first),
    need: null,
  };
}

export function adviceShortStaffed(facts: ResortFacts): readonly Advice[] {
  return (facts.shortStaffed ?? []).map(({ role, short, wanted }) => ({
    kind: 'short-staffed' as const,
    weight: 0.2 + 0.5 * clamp(short / Math.max(1, wanted)),
    subject: role,
    count: short,
    at: null,
    need: null,
  }));
}

// Straight line on purpose: a flow field per lodging per need is the eager sweep
// `router.ts` refuses to do.
export function adviceFarFromHome(facts: ResortFacts): Advice | null {
  let furthest = 0;
  let worst: { readonly lodging: Lodging; readonly need: GuestNeed } | null = null;
  for (const lodging of facts.lodgings) {
    if (facts.unreachable.has(lodging.key)) continue;
    for (const need of GUEST_NEEDS) {
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

// Quiet on purpose: with no staff house the cleaners still restock, only at the gate, so it is
// time lost rather than a thing broken.
export function adviceNoDepot(facts: ResortFacts): Advice | null {
  const cleaners = facts.cleanersOnDuty ?? 0;
  if (facts.depots !== 0 || cleaners <= 0) return null;
  return {
    kind: 'no-depot',
    weight: 0.15,
    subject: 'staff house',
    count: cleaners,
    at: null,
    need: null,
  };
}

// Scaled by size rather than flat, or which idle venues reach the panel comes down
// to placement order. Kept below `adviceUnreachable`'s 0.9.
const IDLE_LOUDEST = 0.4;
const IDLE_ROOMY = 40;

const idleWeight = (capacity: number): number =>
  0.2 + (IDLE_LOUDEST - 0.2) * clamp(capacity / IDLE_ROOMY);

// A quiet first aid is good news, a reception is met at check-in, and a fire pit serves
// nothing until a bonfire is booked on it.
const idleIsFine = (venue: Venue): boolean =>
  venue.receives === true || venue.satisfies.every(({ need }) => need === 'health');

// Silent until somebody has been somewhere: a fresh plot's empty counters would
// read as every building standing idle.
export function adviceUnvisited(facts: ResortFacts): readonly Advice[] {
  if (facts.visits.size === 0) return [];
  return facts.venues
    .filter(
      (venue) =>
        !idleIsFine(venue) &&
        !facts.unreachable.has(venue.key) &&
        (facts.visits.get(venue.key) ?? 0) === 0,
    )
    .map((venue) => ({
      kind: 'unvisited' as const,
      weight: idleWeight(venue.capacity),
      subject: venue.label,
      key: venue.key,
      count: venue.capacity,
      at: tileOf(venue),
      need: null,
    }));
}

// One line for the whole plot, not one per stage: four small stages should not nag four times.
export function adviceNoEvents(facts: ResortFacts): Advice | null {
  const stage = facts.idleStage;
  if (!stage) return null;
  return {
    kind: 'no-events',
    weight: 0.2,
    subject: stage.label,
    key: stage.key,
    count: 0,
    at: tileOf(stage),
    need: null,
  };
}

export function adviceNoWelcome(facts: ResortFacts): Advice | null {
  const arrived = facts.welcomeless ?? 0;
  if (arrived <= 0) return null;
  return {
    kind: 'no-welcome',
    weight: 0.15,
    subject: 'welcome',
    count: arrived,
    at: null,
    need: null,
  };
}

export function adviceNoFireworks(facts: ResortFacts): Advice | null {
  const beach = facts.quietBeach;
  if (!beach) return null;
  return {
    kind: 'no-fireworks',
    weight: 0.1,
    subject: beach.label,
    key: beach.key,
    count: 0,
    at: tileOf(beach),
    need: null,
  };
}

// Both halves: a beach building has no door node but is reachable over the sand.
// Sand routes are not swept per building; that costs too much for too little.
export function unreachableOn<Place extends { readonly key: string }>(
  places: readonly Place[],
  doorsOf: (place: Place) => VenueDoors,
): ReadonlySet<string> {
  const stranded = new Set<string>();
  for (const place of places) {
    const doors = doorsOf(place);
    if (doors.nodes.length === 0 && doors.sand.length === 0) stranded.add(place.key);
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
  for (const need of GUEST_NEEDS) {
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
    adviceUnmade(facts),
    adviceHurt(facts),
    ...adviceUnservedNeeds(facts),
    adviceFullLines(facts),
    ...adviceUnreachable(facts),
    adviceNotStepFree(facts),
    ...adviceShortStaffed(facts),
    ...adviceBroken(facts),
    adviceDirty(facts),
    ...adviceUnwatched(facts),
    adviceLittered(facts),
    adviceFarFromHome(facts),
    adviceNoDepot(facts),
    ...adviceUnvisited(facts),
    adviceNoEvents(facts),
    adviceNoWelcome(facts),
    adviceNoFireworks(facts),
    ...adviceWeatherClosed(facts),
  ].filter((advice): advice is Advice => advice !== null && advice.weight > 0);
  return found.toSorted(louderFirst);
}

// Judged on a whole day's counters, so an hourly refresh keeps the morning's verdict.
const DAY_COUNTED: ReadonlySet<AdviceKind> = new Set(['full-lines', 'unvisited']);

export function refreshedWithin(
  morning: readonly Advice[],
  now: readonly Advice[],
): readonly Advice[] {
  return [
    ...now.filter((advice) => !DAY_COUNTED.has(advice.kind)),
    ...morning.filter((advice) => DAY_COUNTED.has(advice.kind)),
  ].toSorted(louderFirst);
}
