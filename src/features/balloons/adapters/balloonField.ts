import { Group } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  disposeFieldMeshes,
  fieldMaterials,
  fieldMeshesFor,
  fieldTriangles,
  slotsFor,
  type FieldMesh,
} from '../../rendering/adapters/movingField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { poseOf, stepBalloons, type Balloons, type ReleaseSite } from '../domain/balloons';

// A backgrounded tab reports its absence as one frame. Same value as the crowd's,
// but not shared, so a balloon does not depend on how fast somebody walks.
const MAX_STEP = 0.1;

export interface BalloonField {
  readonly group: Group;
  readonly count: number;
  readonly drawCalls: number;
  readonly triangleCount: number;
  advance(dt: number, readiness: number): void;
  dispose(): void;
}

export interface BalloonFieldOptions {
  readonly balloons: Balloons;
  readonly sites: readonly ReleaseSite[];
  readonly models: readonly ModelGeometry[];
  readonly lightVolume?: BakedLightVolume | null;
}

// Scale stands in for a fade: a transparent pass would cost more sorting than it
// is worth, and a waiting balloon is scaled to nothing but keeps its slot.
function writeInstances(part: FieldMesh, balloons: Balloons): void {
  const matrices = part.mesh.instanceMatrix.array;
  for (let slot = 0; slot < part.members.length; slot++) {
    const pose = poseOf(balloons, part.members[slot]!);
    const at = slot * 16;
    matrices[at] = pose.scale;
    matrices[at + 5] = pose.scale;
    matrices[at + 10] = pose.scale;
    matrices[at + 12] = pose.x;
    matrices[at + 13] = pose.y;
    matrices[at + 14] = pose.z;
    matrices[at + 15] = 1;
  }
  part.mesh.instanceMatrix.needsUpdate = true;
}

export function buildBalloonField(options: BalloonFieldOptions): BalloonField {
  const { balloons, models, sites } = options;
  const group = new Group();
  group.name = 'balloons';

  const { lit, glow, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);

  const parts = models.flatMap((model, variant) =>
    fieldMeshesFor({
      name: `balloon-${model.id}`,
      members: slotsFor(balloons.variant, balloons.count, variant),
      surfaces: [
        { kind: 'glow', source: model.emissive, material: glow },
        { kind: 'lit', source: model.lit, material: lit },
      ],
    }),
  );
  for (const part of parts) {
    group.add(part.mesh);
    writeInstances(part, balloons);
  }

  return {
    group,
    get count() {
      return balloons.count;
    },
    drawCalls: parts.length,
    triangleCount: fieldTriangles(parts),
    advance(dt, readiness) {
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepBalloons(balloons, step, readiness, sites);
      for (const part of parts) writeInstances(part, balloons);
    },
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
