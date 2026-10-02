import { Group } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  disposeFieldMeshes,
  fieldMaterials,
  fieldMeshesFor,
  fieldTriangles,
  standTurned,
} from '../../rendering/adapters/movingField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';

export interface ChairField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  // Filled per frame, as the crowd field draws its figures: begin, a put per chair, end.
  begin(): void;
  put(x: number, y: number, z: number, yawCos: number, yawSin: number): void;
  end(): void;
  dispose(): void;
}

export interface ChairFieldOptions {
  readonly model: ModelGeometry;
  readonly capacity: number;
  readonly lightVolume?: BakedLightVolume | null;
}

// One lit mesh, so one draw call however many chairs roll about. Past capacity a chair is left
// undrawn rather than the buffer grown mid-frame.
export function buildChairField(options: ChairFieldOptions): ChairField {
  const { capacity } = options;
  const group = new Group();
  group.name = 'wheelchairs';
  const { lit, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);
  const parts = fieldMeshesFor({
    name: 'wheelchair',
    members: Int32Array.from({ length: capacity }, (_, slot) => slot),
    surfaces: [{ kind: 'lit', source: options.model.lit, material: lit }],
  });
  const part = parts[0] ?? null;
  if (part) {
    group.add(part.mesh);
    const matrices = part.mesh.instanceMatrix.array;
    for (let slot = 0; slot < capacity; slot++) {
      matrices[slot * 16 + 5] = 1;
      matrices[slot * 16 + 15] = 1;
    }
  }
  let filled = 0;

  return {
    group,
    get drawCalls() {
      return part && filled > 0 ? 1 : 0;
    },
    get triangleCount() {
      return part && filled > 0 ? fieldTriangles(parts) : 0;
    },
    begin() {
      filled = 0;
    },
    put(x, y, z, yawCos, yawSin) {
      if (!part || filled >= capacity) return;
      standTurned(
        part.mesh.instanceMatrix.array as Float32Array,
        filled,
        { x, y, z },
        yawCos,
        yawSin,
      );
      filled++;
    },
    end() {
      if (!part) return;
      part.mesh.count = filled;
      part.mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
