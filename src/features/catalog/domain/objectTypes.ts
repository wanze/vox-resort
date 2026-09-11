/**
 * The resort catalogue: every hand-authored object, built once at module load.
 *
 * The models themselves live in `voxel-gen/` — the authoring tool owns them, so
 * the previews rendered offline and the objects rendered in the app come from
 * exactly the same source. This module only adapts them for the app: it builds
 * each model, derives the material set from the colours they paint with, and
 * picks the HUD swatch colour.
 *
 * There are three registries of art, and the difference between them is the
 * whole reason {@link PAINTED_MODELS} exists: `OBJECT_TYPES` is the things that
 * stand on tiles, and the people and the balloons are registries of their own
 * because neither stands on anything. Anything that asks *what the app paints
 * with* has to read all three — see the note on `PAINTED_MODELS`.
 */

import { MODEL_SOURCES } from '../../../../voxel-gen/models/index.ts';
import { PEOPLE_SOURCES } from '../../../../voxel-gen/people/index.ts';
import { SKY_SOURCES } from '../../../../voxel-gen/sky/index.ts';
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

/**
 * The crowd's art: one built model per person the resort can draw.
 *
 * Not `ObjectTypeDefinition`s, and deliberately so — a person has no HUD swatch,
 * no build-palette shelf and no tile footprint to claim, so the three fields
 * that would carry those would all be lies. What a person is, to everything in
 * `src/`, is a model to mesh and a geometry to instance. See `docs/crowd.md`.
 */
export const PEOPLE_MODELS: readonly VoxelModel[] = PEOPLE_SOURCES.map(buildModel);

/**
 * The sky's art: one built model per balloon the beach can let go.
 *
 * Here for the reason {@link PEOPLE_MODELS} is: a balloon has no swatch, no
 * shelf and no footprint, and the three fields that would carry those would all
 * be lies. See `features/balloons/`.
 */
export const SKY_MODELS: readonly VoxelModel[] = SKY_SOURCES.map(buildModel);

/**
 * Every model the app paints: catalogue, crowd and sky alike.
 *
 * The one place the registries are joined, and the reason it is one place:
 * the material set, the emissive lookup and the scratch layout are all questions
 * about *colours the app will paint*, and a person is painted exactly as a
 * cottage is. Derived from `OBJECT_TYPES` alone, the `skin` family — which
 * nothing but a person paints with — would never be registered as a DVE voxel,
 * and the scratch writes would ask the mesher for a voxel that does not exist.
 *
 * A fourth registry is then one line here rather than an edit in each of the
 * four places that used to assume the catalogue was the whole world — which is
 * exactly what the sky cost when it landed.
 */
export const PAINTED_MODELS: readonly VoxelModel[] = [
  ...OBJECT_TYPES.map((type) => type.model),
  ...PEOPLE_MODELS,
  ...SKY_MODELS,
];

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
 * Objects whose model says the ground decides where they go are left out — a
 * flight of stairs is not something to pick, it is what a path becomes where it
 * climbs, so offering one would only ever produce a staircase nothing walks up.
 * The model carries that flag, so this needs no list of ids.
 *
 * Empty categories are dropped rather than printed as an empty shelf, so a
 * category declared ahead of the models that will fill it costs nothing.
 */
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

/** Highest occupied layer of a type, used to anchor its HUD label. */
export function objectTypeTop(id: string): number {
  return objectTypeById(id).model.height;
}

/**
 * Every material the scene can paint with: one per distinct colour across
 * everything the app draws. Each becomes one DVE voxel and one DVE rendered
 * material.
 *
 * Read off {@link PAINTED_MODELS} rather than off the catalogue, so the crowd's
 * own colours are registered too; see the note there.
 */
export function allMaterials(): readonly MaterialDefinition[] {
  return materialsForColors(
    PAINTED_MODELS.flatMap((model) => model.voxels.map((voxel) => voxel.color)),
  );
}

/**
 * The colours each model draws unlit, by model id. Only models that declare an
 * emissive colour appear, so the lookup is empty for most of the catalogue —
 * and for the whole crowd, since nothing about a person glows.
 */
export function emissiveByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of PAINTED_MODELS) {
    if (model.emissive.length > 0) byId.set(model.id, new Set(model.emissive));
  }
  return byId;
}

/**
 * The colours each model draws as water, by model id. Empty for everything but
 * the pools: water is a shader, and a model asks for it by name.
 */
export function waterByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of PAINTED_MODELS) {
    if (model.water.length > 0) byId.set(model.id, new Set(model.water));
  }
  return byId;
}

/**
 * The colours each model glazes its windows with, by model id. Empty for
 * everything but the buildings: a window is a room somebody can be in, and most
 * of the catalogue is furniture.
 */
export function windowsByModelId(): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of PAINTED_MODELS) {
    if (model.windows.length > 0) byId.set(model.id, new Set(model.windows));
  }
  return byId;
}

/** Colour per DVE material id, for colouring the decoded submeshes. */
export function materialColorsById(): ReadonlyMap<string, number> {
  return new Map(allMaterials().map((material) => [materialIdFor(material.key), material.color]));
}
