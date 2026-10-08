import { CATALOGUE_SOURCES, catalogueOf, type Catalogue } from '../../../../voxel-gen/catalogue.ts';
import { buildModel, type VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import { materialIdFor, materialsForColors, type MaterialDefinition } from './materials';

let painted: Catalogue<VoxelModel> | undefined;

// Painting every model takes most of a second and hundreds of megabytes, so only the mesh
// worker calls this; the page and the prep worker read voxel-gen/facts.json instead.
export function paintedCatalogue(): Catalogue<VoxelModel> {
  painted ??= catalogueOf(CATALOGUE_SOURCES, buildModel);
  return painted;
}

export function paintedModelsOf(catalogue: Catalogue<VoxelModel>): readonly VoxelModel[] {
  return [
    ...catalogue.types.map((type) => type.model),
    ...catalogue.people,
    ...catalogue.staff,
    ...catalogue.sky,
    ...catalogue.sea,
    ...catalogue.litter,
    ...catalogue.props,
  ];
}

// Walks every voxel of every model, millions of them, so it runs once per mesh request.
export function materialsOf(models: readonly VoxelModel[]): readonly MaterialDefinition[] {
  const colors = new Set<number>();
  for (const model of models) {
    for (const voxels of [model.voxels, model.canopy?.open ?? [], model.canopy?.furled ?? []]) {
      for (const voxel of voxels) colors.add(voxel.color);
    }
  }
  return materialsForColors(colors);
}

export function materialColorsOf(
  materials: readonly MaterialDefinition[],
): ReadonlyMap<string, number> {
  return new Map(materials.map((material) => [materialIdFor(material.key), material.color]));
}

export function emissiveByModelId(
  models: readonly VoxelModel[],
): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of models) {
    if (model.emissive.length > 0) byId.set(model.id, new Set(model.emissive));
  }
  return byId;
}

export function waterByModelId(
  models: readonly VoxelModel[],
): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of models) {
    if (model.water.length > 0) byId.set(model.id, new Set(model.water));
  }
  return byId;
}

export function windowsByModelId(
  models: readonly VoxelModel[],
): ReadonlyMap<string, ReadonlySet<number>> {
  const byId = new Map<string, ReadonlySet<number>>();
  for (const model of models) {
    if (model.windows.length > 0) byId.set(model.id, new Set(model.windows));
  }
  return byId;
}
