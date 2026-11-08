import type { GuestNeed, ModelVenue } from '../../../../voxel-gen/voxelgen.ts';

export type VenueFlag = 'stage' | 'dj' | 'bathing' | 'calm' | 'cools';

export const VENUE_FLAGS: readonly VenueFlag[] = ['stage', 'dj', 'bathing', 'calm', 'cools'];

export type Requirement =
  | { readonly kind: 'need'; readonly value: GuestNeed }
  | { readonly kind: 'flag'; readonly value: VenueFlag }
  | { readonly kind: 'stars'; readonly value: number }
  | { readonly kind: 'lodging'; readonly value: number };

// What the resort offers, or what the catalogue could: the same shape answers both questions.
export interface Offering {
  readonly needs: ReadonlySet<GuestNeed>;
  readonly flags: ReadonlySet<VenueFlag>;
  readonly lodgingPrices: readonly number[];
}

export interface ResortFacts extends Offering {
  readonly stars: number;
}

type VenueTraits = Pick<ModelVenue, 'role' | 'satisfies' | 'price'> & {
  readonly [flag in VenueFlag]?: boolean;
};

// A placed venue and a catalogue type are read alike, so an agent-built model counts once placed.
export function offeringOf(venues: readonly VenueTraits[]): Offering {
  const needs = new Set<GuestNeed>();
  const flags = new Set<VenueFlag>();
  const lodgingPrices: number[] = [];
  for (const venue of venues) {
    if (venue.role === 'lodging') {
      lodgingPrices.push(venue.price ?? 0);
      continue;
    }
    for (const relief of venue.satisfies ?? []) needs.add(relief.need);
    for (const flag of VENUE_FLAGS) if (venue[flag] === true) flags.add(flag);
  }
  return { needs, flags, lodgingPrices };
}

export function isMet(requirement: Requirement, facts: ResortFacts): boolean {
  switch (requirement.kind) {
    case 'need':
      return facts.needs.has(requirement.value);
    case 'flag':
      return facts.flags.has(requirement.value);
    case 'stars':
      return facts.stars >= requirement.value;
    case 'lodging':
      return facts.lodgingPrices.some((price) => price >= requirement.value);
  }
}

export const unmetOn = (
  requirements: readonly Requirement[],
  facts: ResortFacts,
): readonly Requirement[] => requirements.filter((requirement) => !isMet(requirement, facts));

const NEED_NOUNS: { readonly [need in GuestNeed]: string } = {
  hunger: 'somewhere to eat',
  thirst: 'a bar',
  energy: 'somewhere to rest',
  fun: 'something for the children',
  hygiene: 'showers',
  health: 'a first-aid post',
};

const FLAG_NOUNS: { readonly [flag in VenueFlag]: string } = {
  stage: 'a stage',
  dj: 'a DJ',
  bathing: 'a pool',
  calm: 'a quiet spot',
  cools: 'somewhere to cool off',
};

// Finishes "They promised us ..." as well as "Wants ...", so it is a bare noun phrase.
export function requirementNoun(requirement: Requirement): string {
  switch (requirement.kind) {
    case 'need':
      return NEED_NOUNS[requirement.value];
    case 'flag':
      return FLAG_NOUNS[requirement.value];
    case 'stars':
      return `a ${requirement.value}★ resort`;
    case 'lodging':
      return `rooms at ${requirement.value} a night`;
  }
}

// The stars are the resort's to earn, not the catalogue's to offer.
export function isBuildable(requirement: Requirement, catalogue: Offering): boolean {
  if (requirement.kind === 'stars') return true;
  return isMet(requirement, { ...catalogue, stars: 0 });
}
