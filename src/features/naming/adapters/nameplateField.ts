import { Group, Mesh, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import type { ModelFacts, ModelNameplate } from '../../../../voxel-gen/voxelgen.ts';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotationRadians, turnedOrigin } from '../../layout/domain/rotation';
import { litMaterial } from '../../rendering/adapters/instancedWorld';
import { toGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { letteringFor } from '../domain/lettering';
import { setLine, type SetLine } from '../domain/signFont';

export interface Nameplates {
  readonly group: Group;
  // Every placement given that declares a nameplate gets the name; the caller leaves out what
  // is still being built.
  show(placements: readonly Placement[], name: string): void;
  dispose(): void;
}

// Placed as the instanced world places a model, so the letters land on the board it drew.
function meshOf(
  geometry: BufferGeometry,
  material: Material,
  placement: Placement,
  model: ModelFacts,
): Mesh {
  const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
  const scale = model.scale ?? 1;
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix
    .makeRotationY(rotationRadians(placement.rotation))
    .setPosition(placement.x + origin.x, placement.y, placement.z + origin.z)
    .scale(new Vector3(scale, scale, scale));
  mesh.name = `nameplate ${placement.key}`;
  return mesh;
}

// A plain Mesh per sign, not an instanced bucket: a resort has a few gates, and the lit material
// reads the light volume from the world position either way.
export function createNameplates(
  volume: BakedLightVolume | null,
  modelOf: (id: string) => ModelFacts,
): Nameplates {
  const group = new Group();
  group.name = 'nameplates';
  const material = litMaterial(volume);
  // By model and name, so every gate of one model shares one geometry.
  let cached = new Map<string, BufferGeometry>();
  let fresh = new Map<string, BufferGeometry>();

  const lettered = (id: string, plate: ModelNameplate, name: string, line: SetLine) => {
    const key = `${id}|${name}`;
    const geometry = fresh.get(key) ?? cached.get(key) ?? toGeometry(letteringFor(line, plate));
    fresh.set(key, geometry);
    return geometry;
  };

  const forget = (): void => {
    for (const [key, geometry] of cached) {
      if (!fresh.has(key)) geometry.dispose();
    }
    cached = fresh;
    fresh = new Map();
  };

  return {
    group,
    show(placements, name) {
      group.clear();
      // A name of only characters the font lacks sets as nothing, and nothing is drawn for it.
      const line = setLine(name);
      for (const placement of line.width > 0 ? placements : []) {
        const model = modelOf(placement.id);
        if (!model.nameplate) continue;
        const geometry = lettered(model.id, model.nameplate, name, line);
        group.add(meshOf(geometry, material, placement, model));
      }
      forget();
    },
    dispose() {
      group.clear();
      // Nothing was asked for since, so every geometry kept goes.
      forget();
      material.dispose();
    },
  };
}
