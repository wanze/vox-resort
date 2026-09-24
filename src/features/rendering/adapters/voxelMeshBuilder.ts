import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { fullIdOf } from '../../voxel-world/domain/coarseVoxels';
import { worthCoarsening } from '../domain/levelOfDetail';
import type { MeshAttributes, ModelAttributes } from '../domain/modelAttributes';

export interface ModelGeometry {
  readonly id: string;
  readonly lit: BufferGeometry | null;
  readonly emissive: BufferGeometry | null;
  readonly water: BufferGeometry | null;
  readonly window: BufferGeometry | null;
  readonly triangleCount: number;
  readonly unmergedTriangleCount: number;
  readonly coarse?: ModelGeometry | null;
}

function toGeometry(attributes: MeshAttributes): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(attributes.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(attributes.normals, 3));
  // Attributes arrive already in the linear working space Three.js stores packed hex colours in.
  geometry.setAttribute('color', new BufferAttribute(attributes.colors, 3));
  if (attributes.panes) {
    geometry.setAttribute('pane', new BufferAttribute(attributes.panes, 1));
  }
  geometry.setIndex(new BufferAttribute(attributes.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function geometryOf(model: ModelAttributes, coarse: ModelGeometry | null): ModelGeometry {
  return {
    id: model.id,
    lit: model.lit ? toGeometry(model.lit) : null,
    emissive: model.emissive ? toGeometry(model.emissive) : null,
    water: model.water ? toGeometry(model.water) : null,
    window: model.window ? toGeometry(model.window) : null,
    triangleCount: model.triangleCount,
    unmergedTriangleCount: model.unmergedTriangleCount,
    coarse,
  };
}

// Coarse copies hang off their model rather than being listed, so only the level of detail can
// reach them.
export function buildModelGeometries(models: readonly ModelAttributes[]): ModelGeometry[] {
  const coarseByFullId = new Map<string, ModelAttributes>();
  for (const model of models) {
    const full = fullIdOf(model.id);
    if (full !== null) coarseByFullId.set(full, model);
  }
  return models
    .filter((model) => fullIdOf(model.id) === null)
    .map((model) => {
      const coarse = coarseByFullId.get(model.id);
      const kept =
        coarse && worthCoarsening(model.triangleCount, coarse.triangleCount)
          ? geometryOf(coarse, null)
          : null;
      return geometryOf(model, kept);
    });
}
