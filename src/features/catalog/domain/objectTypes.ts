/**
 * The resort catalogue: every hand-authored object, built once at module load.
 *
 * The models themselves live in `voxel-gen/` — the authoring tool owns them, so
 * the previews rendered offline and the objects rendered in the app come from
 * exactly the same source. This module only adapts them for the app: it builds
 * each model, derives the material set from the colours they paint with, and
 * picks the HUD swatch colour.
 */

import { MODEL_SOURCES } from '../../../../voxel-gen/models/index.ts';
import {
  buildModel,
  MODEL_CATEGORIES,
  TILE_VOXELS,
  type ModelCategory,
  type VoxelModel,
} from '../../../../voxel-gen/voxelgen.ts';
import { materialIdFor, materialsForColors, type MaterialDefinition } from './materials';

export { TILE_VOXELS };

export interface ObjectTypeDefinition {
  /** Stable identifier, shared with the model file and its preview. */
  readonly id: string;
  /** Human readable name shown in the HUD. */
  readonly label: string;
  /** Shelf of the build palette the type is offered on. */
  readonly category: ModelCategory;
  /** The object's voxels, normalised to start at its own corner. */
  readonly model: VoxelModel;
  /** Colour of the HUD swatch: the colour the model uses most. */
  readonly color: number;
}

/** The colour a model paints most cells with, used as its HUD swatch. */
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
  };
});

export interface ObjectTypeGroup {
  readonly category: ModelCategory;
  /** Heading the palette prints above the group. */
  readonly label: string;
  readonly types: readonly ObjectTypeDefinition[];
}

/**
 * The catalogue as the build palette shows it: one group per category, in the
 * order the art declares them, each holding its types in registry order.
 *
 * Empty categories are dropped rather than printed as an empty shelf, so a
 * category declared ahead of the models that will fill it costs nothing.
 */
export function objectTypeGroups(): readonly ObjectTypeGroup[] {
  return MODEL_CATEGORIES.map((category) => ({
    category: category.id,
    label: category.label,
    types: OBJECT_TYPES.filter((type) => type.category === category.id),
  })).filter((group) => group.types.length > 0);
}

export function objectTypeById(id: string): ObjectTypeDefinition {
  const found = OBJECT_TYPES.find((type) => type.id === id);
  if (!found) throw new Error(`Unknown object type "${id}"`);
  return found;
}

/** Highest occupied layer of a type, used to anchor its HUD label. */
export function objectTypeTop(id: string): number {
  return objectTypeById(id).model.height;
}

/**
 * Every material the scene can paint with: one per distinct colour across the
 * whole catalogue. Each becomes one DVE voxel and one DVE rendered material.
 */
export function allMaterials(): readonly MaterialDefinition[] {
  return materialsForColors(
    OBJECT_TYPES.flatMap((type) => type.model.voxels.map((voxel) => voxel.color)),
  );
}

/**
 * The colours each model draws unlit, by model id. Only models that declare an
 * emissive colour appear, so the lookup is empty for most of the catalogue.
 */
export function emissiveByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const type of OBJECT_TYPES) {
    if (type.model.emissive.length > 0) byId.set(type.id, new Set(type.model.emissive));
  }
  return byId;
}

/** Colour per DVE material id, for colouring the decoded submeshes. */
export function materialColorsById(): ReadonlyMap<string, number> {
  return new Map(allMaterials().map((material) => [materialIdFor(material.key), material.color]));
}
