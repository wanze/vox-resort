import type { VenueRole } from '../../../../voxel-gen/voxelgen.ts';
import { NEEDS_CLEANING } from './upkeep';
import type { Venue } from './venues';

export type NuisanceKind = 'smell' | 'noise';

export const SMELL = 0;
export const NOISE = 1;

const KINDS: readonly NuisanceKind[] = ['smell', 'noise'];

// A smell carries past the next table, not across a square.
const SMELL_REACH = 2;

const NOISE_REACH = 4;

// Under NEEDS_CLEANING, so a toilet the cleaners reach in time never smells at all.
export const SMELLS_BELOW = NEEDS_CLEANING - 0.1;

const REEKS_AT = 0.2;

// A DJ or a band is loud to an empty room, so a club is heard all night whoever dances.
export const MUSIC_FLOOR = 0.5;

// Half full is as loud as it gets: a crowd is loud long before every place is taken.
const LOUD_AT_SHARE = 2;

// Below this a guest does not say so, nor mind it beyond going elsewhere next time.
export const HEARD_FROM = 0.25;

// As DETOUR_UPSET: once a visit, so a regular cannot sink on it.
export const NUISANCE_UPSET = 0.05;

// Smell, then noise. Bars and clubs mind no noise, because they are the noise. A lodging minds
// noise as a calm venue does; its smell is whatever the cleaners' last round left, not placement.
const MINDS: { readonly [role in VenueRole]: readonly [number, number] } = {
  food: [1, 0.3],
  drink: [0.6, 0],
  activity: [0.2, 0],
  service: [0, 0],
  lodging: [0, 1],
};

type NuisanceVenue = Pick<
  Venue,
  'role' | 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ' | 'noise' | 'smell' | 'calm'
>;

type Footprint = Pick<Venue, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ'>;

type Listener = Footprint & Pick<Venue, 'role' | 'calm'>;

export interface NuisanceSource {
  readonly venue: number;
  readonly kind: number;
  readonly strength: number;
}

// Flat by listener: listener v's entries run from start[v] to start[v + 1].
export interface Nuisance {
  readonly start: Int32Array;
  readonly source: Int32Array;
  readonly kind: Uint8Array;
  readonly weight: Float32Array;
  readonly sources: readonly NuisanceSource[];
}

// 0 to 1, how strong a source is right now: by its dirt for a smell, its crowd for a noise.
export type NuisanceLive = (source: number, kind: number) => number;

export interface NuisanceField {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly value: Float32Array;
}

const reachOf = (kind: number): number => (kind === SMELL ? SMELL_REACH : NOISE_REACH);

const gapAlong = (a0: number, aSize: number, b0: number, bSize: number): number =>
  b0 >= a0 + aSize ? b0 - (a0 + aSize - 1) : a0 >= b0 + bSize ? a0 - (b0 + bSize - 1) : 0;

// Adjacent is 1, as scenery.ts measures; overlapping counts as adjacent.
const gapBetween = (a: Footprint, b: Footprint): number =>
  Math.max(
    1,
    gapAlong(a.tileX, a.tilesX, b.tileX, b.tilesX),
    gapAlong(a.tileZ, a.tilesZ, b.tileZ, b.tilesZ),
  );

const falloff = (gap: number, reach: number): number => Math.max(0, 1 - gap / (reach + 1));

function sensitivity(listener: Listener, kind: number): number {
  if (kind === NOISE && listener.calm === true) return 1;
  return MINDS[listener.role][kind]!;
}

function sourcesOf(venues: readonly NuisanceVenue[]): NuisanceSource[] {
  const sources: NuisanceSource[] = [];
  venues.forEach((venue, index) => {
    if ((venue.smell ?? 0) > 0) sources.push({ venue: index, kind: SMELL, strength: venue.smell! });
    if ((venue.noise ?? 0) > 0) sources.push({ venue: index, kind: NOISE, strength: venue.noise! });
  });
  return sources;
}

function nuisanceOver(
  listeners: readonly Listener[],
  venues: readonly NuisanceVenue[],
  same: (listener: number, source: number) => boolean,
): Nuisance {
  const sources = sourcesOf(venues);
  const start = new Int32Array(listeners.length + 1);
  const source: number[] = [];
  const kind: number[] = [];
  const weight: number[] = [];
  listeners.forEach((listener, index) => {
    start[index] = source.length;
    for (const from of sources) {
      if (same(index, from.venue)) continue;
      const gap = gapBetween(listener, venues[from.venue]!);
      const felt =
        from.strength * falloff(gap, reachOf(from.kind)) * sensitivity(listener, from.kind);
      if (felt <= 0) continue;
      source.push(from.venue);
      kind.push(from.kind);
      weight.push(felt);
    }
  });
  start[listeners.length] = source.length;
  return {
    start,
    source: Int32Array.from(source),
    kind: Uint8Array.from(kind),
    weight: Float32Array.from(weight),
    sources,
  };
}

export const nuisanceFor = (venues: readonly NuisanceVenue[]): Nuisance =>
  nuisanceOver(venues, venues, (listener, source) => listener === source);

// Lodgings stay out of the venue list, so they listen in a list of their own.
export const lodgingNuisanceFor = (
  lodgings: readonly Footprint[],
  venues: readonly NuisanceVenue[],
): Nuisance =>
  nuisanceOver(
    lodgings.map((lodging) => ({ ...lodging, role: 'lodging' as const })),
    venues,
    () => false,
  );

export function smellOf(clean: number): number {
  if (clean >= SMELLS_BELOW) return 0;
  if (clean <= REEKS_AT) return 1;
  return (SMELLS_BELOW - clean) / (SMELLS_BELOW - REEKS_AT);
}

export function noiseOf(inside: number, capacity: number, music = false): number {
  const crowd = Math.min(1, (LOUD_AT_SHARE * inside) / Math.max(1, capacity));
  return Math.max(music ? MUSIC_FLOOR : 0, crowd);
}

const outOfList = (nuisance: Nuisance, listener: number): boolean =>
  listener < 0 || listener + 1 >= nuisance.start.length;

// Past the end is the router's beach, which has no neighbours.
export function feltAt(nuisance: Nuisance, venue: number, live: NuisanceLive): number {
  if (outOfList(nuisance, venue)) return 0;
  let smell = 0;
  let noise = 0;
  for (let at = nuisance.start[venue]!; at < nuisance.start[venue + 1]!; at++) {
    const kind = nuisance.kind[at]!;
    const felt = nuisance.weight[at]! * live(nuisance.source[at]!, kind);
    if (kind === SMELL) smell += felt;
    else noise += felt;
  }
  return Math.min(1, Math.min(1, smell) + Math.min(1, noise));
}

export interface Worst {
  readonly kind: NuisanceKind;
  readonly source: number;
  readonly felt: number;
}

// Allocates nothing, so a pass over every sleeper each frame may ask it.
export function feltOfKind(
  nuisance: Nuisance,
  listener: number,
  live: NuisanceLive,
  kind: number,
): number {
  if (outOfList(nuisance, listener)) return 0;
  let sum = 0;
  for (let at = nuisance.start[listener]!; at < nuisance.start[listener + 1]!; at++) {
    if (nuisance.kind[at] === kind) sum += nuisance.weight[at]! * live(nuisance.source[at]!, kind);
  }
  return Math.min(1, sum);
}

// The source adding most, -1 for none; entries run in source order, so ties go to the lower index.
export function loudestOf(
  nuisance: Nuisance,
  listener: number,
  live: NuisanceLive,
  kind: number,
): number {
  if (outOfList(nuisance, listener)) return -1;
  let source = -1;
  let most = 0;
  for (let at = nuisance.start[listener]!; at < nuisance.start[listener + 1]!; at++) {
    if (nuisance.kind[at] !== kind) continue;
    const felt = nuisance.weight[at]! * live(nuisance.source[at]!, kind);
    if (felt > most) {
      most = felt;
      source = nuisance.source[at]!;
    }
  }
  return source;
}

const worstOfKind = (nuisance: Nuisance, venue: number, live: NuisanceLive, kind: number) => ({
  felt: feltOfKind(nuisance, venue, live, kind),
  source: loudestOf(nuisance, venue, live, kind),
});

// The kind felt more, and within it the source that adds most; ties go to smell and the lower index.
export function worstAt(nuisance: Nuisance, venue: number, live: NuisanceLive): Worst | null {
  if (outOfList(nuisance, venue)) return null;
  const smell = worstOfKind(nuisance, venue, live, SMELL);
  const noise = worstOfKind(nuisance, venue, live, NOISE);
  const kind = noise.felt > smell.felt ? NOISE : SMELL;
  const worst = kind === NOISE ? noise : smell;
  if (worst.source < 0) return null;
  return { kind: KINDS[kind]!, source: worst.source, felt: worst.felt };
}

export interface Minded {
  readonly kind: NuisanceKind;
  // The neighbour's name, as a guest would say it.
  readonly from: string;
  readonly felt: number;
}

export function mindedAt(
  nuisance: Nuisance,
  venues: readonly Pick<Venue, 'label'>[],
  venue: number,
  live: NuisanceLive,
): Minded | null {
  const worst = worstAt(nuisance, venue, live);
  const from = worst ? venues[worst.source] : undefined;
  return worst && from ? { kind: worst.kind, from: from.label, felt: worst.felt } : null;
}

// By key, and only where a guest would say so: what the advice is told.
export function mindedOver(
  nuisance: Nuisance,
  venues: readonly Pick<Venue, 'key' | 'label'>[],
  live: NuisanceLive,
): Map<string, Minded> {
  const minded = new Map<string, Minded>();
  venues.forEach((venue, index) => {
    const worst = mindedAt(nuisance, venues, index, live);
    if (worst && worst.felt > HEARD_FROM) minded.set(venue.key, worst);
  });
  return minded;
}

function spread(
  sum: Float32Array,
  around: Footprint,
  strength: number,
  reach: number,
  field: Omit<NuisanceField, 'value'>,
): void {
  const x0 = Math.max(0, around.tileX - reach);
  const x1 = Math.min(field.tilesX - 1, around.tileX + around.tilesX - 1 + reach);
  const z0 = Math.max(0, around.tileZ - reach);
  const z1 = Math.min(field.tilesZ - 1, around.tileZ + around.tilesZ - 1 + reach);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const gap = gapBetween({ tileX: x, tileZ: z, tilesX: 1, tilesZ: 1 }, around);
      sum[z * field.tilesX + x]! += strength * falloff(gap, reach);
    }
  }
}

// Where it smells or is loud, minded by nobody in particular: what the overlay shows.
export function nuisanceFieldFor(
  sources: readonly NuisanceSource[],
  venues: readonly Footprint[],
  live: NuisanceLive,
  tilesX: number,
  tilesZ: number,
): NuisanceField {
  const sums = [new Float32Array(tilesX * tilesZ), new Float32Array(tilesX * tilesZ)];
  for (const { venue, kind, strength } of sources) {
    const now = strength * live(venue, kind);
    const around = venues[venue];
    if (now <= 0 || !around) continue;
    spread(sums[kind]!, around, now, reachOf(kind), { tilesX, tilesZ });
  }
  const [smell, noise] = sums as [Float32Array, Float32Array];
  const value = new Float32Array(tilesX * tilesZ);
  for (let tile = 0; tile < value.length; tile++) {
    value[tile] = Math.max(Math.min(1, smell[tile]!), Math.min(1, noise[tile]!));
  }
  return { tilesX, tilesZ, value };
}
