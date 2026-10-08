import { LITTER_SOURCES } from './litter/index.ts';
import { MODEL_SOURCES } from './models/index.ts';
import { PEOPLE_SOURCES, STAFF_SOURCES } from './people/index.ts';
import { PROP_SOURCES } from './props/index.ts';
import { SEA_SOURCES } from './sea/index.ts';
import { SKY_SOURCES } from './sky/index.ts';
import { VARIANTS } from './variants/index.ts';
import { buildModel, factsOf, type ModelFacts, type VoxelModelSource } from './voxelgen.ts';

export interface CatalogueType<T> {
  readonly family: string;
  readonly model: T;
}

// Every registry, not only the object types: only people paint with skin, and without them the
// mesher would be asked for a voxel DVE never registered.
export interface Catalogue<T> {
  readonly types: readonly CatalogueType<T>[];
  readonly people: readonly T[];
  // A list of its own because a guest's variant indexes people, so a cleaner in it would be
  // dealt to a guest.
  readonly staff: readonly T[];
  readonly sky: readonly T[];
  readonly sea: readonly T[];
  readonly litter: readonly T[];
  readonly props: readonly T[];
}

export const CATALOGUE_SOURCES: Catalogue<VoxelModelSource> = {
  types: [
    ...MODEL_SOURCES.map((source) => ({ family: source.id, model: source })),
    ...VARIANTS.map((variant) => ({ family: variant.of, model: variant.source })),
  ],
  people: PEOPLE_SOURCES,
  staff: STAFF_SOURCES,
  sky: SKY_SOURCES,
  sea: SEA_SOURCES,
  litter: LITTER_SOURCES,
  props: PROP_SOURCES,
};

export function catalogueOf<T, U>(catalogue: Catalogue<T>, map: (model: T) => U): Catalogue<U> {
  return {
    types: catalogue.types.map((type) => ({ family: type.family, model: map(type.model) })),
    people: catalogue.people.map(map),
    staff: catalogue.staff.map(map),
    sky: catalogue.sky.map(map),
    sea: catalogue.sea.map(map),
    litter: catalogue.litter.map(map),
    props: catalogue.props.map(map),
  };
}

export const catalogueFacts = (): Catalogue<ModelFacts> =>
  catalogueOf(CATALOGUE_SOURCES, (source) => factsOf(buildModel(source)));
