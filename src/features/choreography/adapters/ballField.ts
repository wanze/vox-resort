import { Group } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  disposeFieldMeshes,
  fieldMaterials,
  fieldMeshesFor,
  fieldTriangles,
  type FieldMesh,
} from '../../rendering/adapters/movingField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import type { DrawnBall } from '../domain/courts';

export interface BallField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  write(courts: readonly { readonly ball: DrawnBall }[]): void;
  dispose(): void;
}

export interface BallFieldOptions {
  readonly models: readonly ModelGeometry[];
  // Per model: how many courts can play with it at once.
  readonly capacity: number;
  readonly lightVolume?: BakedLightVolume | null;
}

// A slot with no ball is scaled to nothing, as an empty litter slot is.
function writeSlot(part: FieldMesh, slot: number, ball: DrawnBall | null): void {
  const matrices = part.mesh.instanceMatrix.array;
  const at = slot * 16;
  matrices.fill(0, at, at + 16);
  matrices[at + 15] = 1;
  if (!ball) return;
  matrices[at] = 1;
  matrices[at + 5] = 1;
  matrices[at + 10] = 1;
  matrices[at + 12] = ball.x;
  matrices[at + 13] = ball.y;
  matrices[at + 14] = ball.z;
}

export function buildBallField(options: BallFieldOptions): BallField {
  const { models, capacity } = options;
  const group = new Group();
  group.name = 'balls';
  const { lit, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);
  const members = Int32Array.from({ length: capacity }, (_, slot) => slot);
  // Lit only, so one mesh, one draw call, per ball.
  const byModel = new Map<string, FieldMesh>();
  for (const model of models) {
    const [part] = fieldMeshesFor({
      name: `ball-${model.id}`,
      members,
      surfaces: [{ kind: 'lit', source: model.lit, material: lit }],
    });
    if (part) byModel.set(model.id, part);
  }
  const parts = [...byModel.values()];
  for (const part of parts) group.add(part.mesh);
  const filled = new Map<FieldMesh, number>(parts.map((part) => [part, 0]));

  const write = (courts: readonly { readonly ball: DrawnBall }[]): void => {
    for (const part of parts) filled.set(part, 0);
    for (const { ball } of courts) {
      const part = ball.shown ? byModel.get(ball.model) : undefined;
      const slot = part ? filled.get(part)! : capacity;
      if (!part || slot >= capacity) continue;
      writeSlot(part, slot, ball);
      filled.set(part, slot + 1);
    }
    for (const part of parts) {
      for (let slot = filled.get(part)!; slot < capacity; slot++) writeSlot(part, slot, null);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  write([]);

  return {
    group,
    drawCalls: parts.length,
    triangleCount: fieldTriangles(parts),
    write,
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
