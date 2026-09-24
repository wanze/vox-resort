import { MODEL_SOURCES } from '../../../../voxel-gen/models/index.ts';
import { PEOPLE_SOURCES, STAFF_SOURCES } from '../../../../voxel-gen/people/index.ts';
import { SEA_SOURCES } from '../../../../voxel-gen/sea/index.ts';
import { SKY_SOURCES } from '../../../../voxel-gen/sky/index.ts';
import {
  buildModel,
  MODEL_CATEGORIES,
  TILE_VOXELS,
  type ModelCategory,
  type ModelVenue,
  type VoxelModel,
} from '../../../../voxel-gen/voxelgen.ts';
import { materialIdFor, materialsForColors, type MaterialDefinition } from './materials';

export { TILE_VOXELS };
export type { ModelVenue };

export interface ObjectTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly category: ModelCategory;
  readonly model: VoxelModel;
  readonly color: number;
  readonly venue: ModelVenue | null;
}

function dominantColor(model: VoxelModel): number {
  const counts = new Map<number, number>();
  for (const voxel of model.voxels) counts.set(voxel.color, (counts.get(voxel.color) ?? 0) + 1);
  let best = 0;
  let bestCount = -1;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

export const OBJECT_TYPES: readonly ObjectTypeDefinition[] = MODEL_SOURCES.map((source) => {
  const model = buildModel(source);
  return {
    id: model.id,
    label: model.label,
    category: model.category,
    model,
    color: dominantColor(model),
    venue: model.venue,
  };
});

// Not ObjectTypeDefinitions: a person has no swatch, shelf or footprint to claim.
export const PEOPLE_MODELS: readonly VoxelModel[] = PEOPLE_SOURCES.map(buildModel);

// A list of its own because a guest's variant indexes PEOPLE_MODELS, so a cleaner
// in it would be dealt to a guest.
export const STAFF_MODELS: readonly VoxelModel[] = STAFF_SOURCES.map(buildModel);

export const SKY_MODELS: readonly VoxelModel[] = SKY_SOURCES.map(buildModel);

export const SEA_MODELS: readonly VoxelModel[] = SEA_SOURCES.map(buildModel);

// Materials must come from every registry: only people paint with skin, and
// without it the mesher would be asked for a voxel DVE never registered.
export const PAINTED_MODELS: readonly VoxelModel[] = [
  ...OBJECT_TYPES.map((type) => type.model),
  ...PEOPLE_MODELS,
  ...STAFF_MODELS,
  ...SKY_MODELS,
  ...SEA_MODELS,
];

export interface ObjectTypeGroup {
  readonly category: ModelCategory;
  readonly label: string;
  readonly types: readonly ObjectTypeDefinition[];
}

export function objectTypeGroups(): readonly ObjectTypeGroup[] {
  const offered = OBJECT_TYPES.filter((type) => !type.model.groundDecides);
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

export function objectTypeTop(id: string): number {
  return objectTypeById(id).model.height;
}

export function venueOf(id: string): ModelVenue | null {
  return OBJECT_TYPES.find((type) => type.id === id)?.venue ?? null;
}

export function venueTypes(): readonly ObjectTypeDefinition[] {
  return OBJECT_TYPES.filter((type) => type.venue !== null);
}

export function bedsOf(id: string): number {
  return venueOf(id)?.beds ?? 0;
}

export function isGateway(id: string): boolean {
  return OBJECT_TYPES.find((type) => type.id === id)?.model.gateway ?? false;
}

export function allMaterials(): readonly MaterialDefinition[] {
  return materialsForColors(
    PAINTED_MODELS.flatMap((model) => model.voxels.map((voxel) => voxel.color)),
  );
}

export function emissiveByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of PAINTED_MODELS) {
    if (model.emissive.length > 0) byId.set(model.id, new Set(model.emissive));
  }
  return byId;
}

export function waterByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of PAINTED_MODELS) {
    if (model.water.length > 0) byId.set(model.id, new Set(model.water));
  }
  return byId;
}

export function windowsByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of PAINTED_MODELS) {
    if (model.windows.length > 0) byId.set(model.id, new Set(model.windows));
  }
  return byId;
}

export function materialColorsById(): ReadonlyMap<string, number> {
  return new Map(allMaterials().map((material) => [materialIdFor(material.key), material.color]));
}
