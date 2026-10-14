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

// Half full is as loud as it gets: a crowd is loud long before every place is taken.
const LOUD_AT_SHARE = 2;

// Below this a guest does not say so, nor mind it beyond going elsewhere next time.
export const HEARD_FROM = 0.25;

// As DETOUR_UPSET: once a visit, so a regular cannot sink on it.
export const NUISANCE_UPSET = 0.05;

// Smell, then noise. Bars and clubs mind no noise, because they are the noise.
const MINDS: { readonly [role in VenueRole]: readonly [number, number] } = {
  food: [1, 0.3],
  drink: [0.6, 0],
  activity: [0.2, 0],
  service: [0, 0],
  lodging: [0, 0],
};

type NuisanceVenue = Pick<
  Venue,
  'role' | 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ' | 'noise' | 'smell' | 'calm'
>;

type Footprint = Pick<Venue, 'tileX' | 'tileZ' | 'tilesX' | 'tilesZ'>;

export interface NuisanceSource {
  readonly venue: number;
  readonly kind: number;
  readonly strength: number;
}

// Flat by listener: venue v's entries run from start[v] to start[v + 1].
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

function sensitivity(listener: NuisanceVenue, kind: number): number {
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

export function nuisanceFor(venues: readonly NuisanceVenue[]): Nuisance {
  const sources = sourcesOf(venues);
  const start = new Int32Array(venues.length + 1);
  const source: number[] = [];
  const kind: number[] = [];
  const weight: number[] = [];
  venues.forEach((listener, index) => {
    start[index] = source.length;
    for (const from of sources) {
      if (from.venue === index) continue;
      const gap = gapBetween(listener, venues[from.venue]!);
      const felt =
        from.strength * falloff(gap, reachOf(from.kind)) * sensitivity(listener, from.kind);
      if (felt <= 0) continue;
      source.push(from.venue);
      kind.push(from.kind);
      weight.push(felt);
    }
  });
  start[venues.length] = source.length;
  return {
    start,
    source: Int32Array.from(source),
    kind: Uint8Array.from(kind),
    weight: Float32Array.from(weight),
    sources,
  };
}

export function smellOf(clean: number): number {
  if (clean >= SMELLS_BELOW) return 0;
  if (clean <= REEKS_AT) return 1;
  return (SMELLS_BELOW - clean) / (SMELLS_BELOW - REEKS_AT);
}

export function noiseOf(inside: number, capacity: number): number {
  return Math.min(1, (LOUD_AT_SHARE * inside) / Math.max(1, capacity));
}

// Past the end is the router's beach, which has no neighbours.
export function feltAt(nuisance: Nuisance, venue: number, live: NuisanceLive): number {
  if (venue < 0 || venue + 1 >= nuisance.start.length) return 0;
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

function worstOfKind(nuisance: Nuisance, venue: number, live: NuisanceLive, kind: number) {
  let sum = 0;
  let source = -1;
  let most = 0;
  for (let at = nuisance.start[venue]!; at < nuisance.start[venue + 1]!; at++) {
    if (nuisance.kind[at] !== kind) continue;
    const felt = nuisance.weight[at]! * live(nuisance.source[at]!, kind);
    sum += felt;
    if (felt > most) {
      most = felt;
      source = nuisance.source[at]!;
    }
  }
  return { felt: Math.min(1, sum), source };
}

// The kind felt more, and within it the source that adds most; ties go to smell and the lower index.
export function worstAt(nuisance: Nuisance, venue: number, live: NuisanceLive): Worst | null {
  if (venue < 0 || venue + 1 >= nuisance.start.length) return null;
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
