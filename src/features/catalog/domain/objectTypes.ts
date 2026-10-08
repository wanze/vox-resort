import catalogueJson from '../../../../voxel-gen/facts.json';
import type { Catalogue } from '../../../../voxel-gen/catalogue.ts';
import {
  MODEL_CATEGORIES,
  TILE_VOXELS,
  type ModelCategory,
  type ModelDepot,
  type ModelFacts,
  type ModelHire,
  type ModelMosaic,
  type ModelVenue,
  type SignKind,
  type SoundKind,
  type VenueRole,
} from '../../../../voxel-gen/voxelgen.ts';

// JSON widens every string union to string, hence the cast; voxel-gen/catalogue.test.ts holds
// the file equal to catalogueFacts(), which is typed, so a wrong shape fails a test.
const CATALOGUE = catalogueJson as unknown as Catalogue<ModelFacts>;

export { TILE_VOXELS };
export type { ModelMosaic, ModelVenue, SignKind, SoundKind };

export interface ObjectTypeDefinition {
  readonly id: string;
  // The family's, so the world never names a style; styleLabel tells them apart.
  readonly label: string;
  readonly family: string;
  readonly style: number;
  readonly styleLabel: string;
  readonly category: ModelCategory;
  readonly model: ModelFacts;
  readonly color: number;
  readonly venue: ModelVenue | null;
}

const FAMILY_LABELS: ReadonlyMap<string, string> = new Map(
  CATALOGUE.types.map(({ model }) => [model.id, model.label]),
);

export const OBJECT_TYPES: readonly ObjectTypeDefinition[] = CATALOGUE.types.map(
  ({ family, model }, index) => {
    const style = CATALOGUE.types.slice(0, index).filter((type) => type.family === family).length;
    return {
      id: model.id,
      label: FAMILY_LABELS.get(family) ?? model.label,
      family,
      style,
      styleLabel: model.label,
      category: model.category,
      model,
      color: model.dominantColor,
      venue: model.venue,
    };
  },
);

// Each family once: what the palette offers and what the generator stands.
export const ORIGINAL_TYPES: readonly ObjectTypeDefinition[] = OBJECT_TYPES.filter(
  (type) => type.style === 0,
);

// Not ObjectTypeDefinitions: a person has no swatch, shelf or footprint to claim.
export const PEOPLE_MODELS: readonly ModelFacts[] = CATALOGUE.people;

// A list of its own because a guest's variant indexes PEOPLE_MODELS, so a cleaner
// in it would be dealt to a guest.
export const STAFF_MODELS: readonly ModelFacts[] = CATALOGUE.staff;

export const SKY_MODELS: readonly ModelFacts[] = CATALOGUE.sky;

export const SEA_MODELS: readonly ModelFacts[] = CATALOGUE.sea;

export const LITTER_MODELS: readonly ModelFacts[] = CATALOGUE.litter;

export const PROP_MODELS: readonly ModelFacts[] = CATALOGUE.props;

export interface ObjectTypeGroup {
  readonly category: ModelCategory;
  readonly label: string;
  readonly types: readonly ObjectTypeDefinition[];
}

export function objectTypeGroups(): readonly ObjectTypeGroup[] {
  const offered = ORIGINAL_TYPES.filter((type) => !type.model.groundDecides);
  return MODEL_CATEGORIES.map((category) => ({
    category: category.id,
    label: category.label,
    types: offered.filter((type) => type.category === category.id),
  })).filter((group) => group.types.length > 0);
}

export function objectTypeById(id: string): ObjectTypeDefinition {
  const found = OBJECT_TYPES.find((type) => type.id === id);
  if (!found) throw new Error(`Unknown object type "${id}"`);
  return found;
}

const FAMILIES: ReadonlyMap<string, string> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.family]),
);

// An unknown id is its own family, so a caller comparing families needs no catalogue check.
export function familyOf(id: string): string {
  return FAMILIES.get(id) ?? id;
}

export function stylesOf(family: string): readonly ObjectTypeDefinition[] {
  return OBJECT_TYPES.filter((type) => type.family === family);
}

export function objectTypeTop(id: string): number {
  return objectTypeById(id).model.height;
}

export function venueOf(id: string): ModelVenue | null {
  return OBJECT_TYPES.find((type) => type.id === id)?.venue ?? null;
}

const ROLE_SIGNS: { readonly [role in VenueRole]: SignKind | null } = {
  lodging: null,
  food: 'food',
  drink: 'drink',
  activity: 'fun',
  service: 'service',
};

export function signFor(venue: ModelVenue | null): SignKind | null {
  if (!venue || venue.role === 'lodging') return null;
  return venue.sign ?? ROLE_SIGNS[venue.role];
}

// The original's, as the label is: a variant is the same kind of place in another look.
export const signOf = (id: string): SignKind | null => signFor(venueOf(familyOf(id)));

export const namesOf = (id: string): readonly string[] => venueOf(familyOf(id))?.names ?? [];

const HIRES: ReadonlyMap<string, ModelHire | null> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.hire]),
);

// The original's, as a variant hires out the same craft in another look.
export const hireOf = (id: string): ModelHire | null => HIRES.get(familyOf(id)) ?? null;

export function venueTypes(): readonly ObjectTypeDefinition[] {
  return OBJECT_TYPES.filter((type) => type.venue !== null);
}

export function bedsOf(id: string): number {
  return venueOf(id)?.beds ?? 0;
}

export function isGateway(id: string): boolean {
  return OBJECT_TYPES.find((type) => type.id === id)?.model.gateway ?? false;
}

export function depotOf(id: string): ModelDepot | null {
  return OBJECT_TYPES.find((type) => type.id === id)?.model.depot ?? null;
}

const SCENERY: ReadonlyMap<string, number> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.scenery]),
);

// A map, not a search: paving joins the scenery field, so this is asked once a path tile a rebuild.
export const sceneryOf = (id: string): number => SCENERY.get(id) ?? 0;

const SHADES: ReadonlySet<string> = new Set(
  OBJECT_TYPES.filter((type) => type.model.shade).map((type) => type.id),
);

export const shadeOf = (id: string): boolean => SHADES.has(id);

const MOSAICS: ReadonlyMap<string, ModelMosaic | null> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.mosaic]),
);

export const mosaicOf = (id: string): ModelMosaic | null => MOSAICS.get(id) ?? null;

const SOUNDS: ReadonlyMap<string, SoundKind | null> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.sound]),
);

// The original's, as the sign is: a variant is the same kind of place in another look.
export const soundOf = (id: string): SoundKind | null => SOUNDS.get(familyOf(id)) ?? null;

export function binReachOf(id: string): number {
  return OBJECT_TYPES.find((type) => type.id === id)?.model.binReach ?? 0;
}
