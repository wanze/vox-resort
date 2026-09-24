import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  figureGeometry,
  figureMaterial,
  POSE_COS,
  POSE_PHASE,
  POSE_RESTING,
  POSE_SIN,
  POSE_STRIDE,
} from '../../rendering/adapters/figureField';
import { pixelsPerVoxel, standsOut, type DetailView } from '../../rendering/domain/levelOfDetail';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { MAX_STEP, reseatCrowd, restingOn, stepCrowd, type Crowd } from '../domain/crowd';
import type { WalkNetwork } from '../domain/walkNetwork';

export interface CrowdField {
  readonly group: Group;
  // A getter, because relocate rebinds it.
  readonly crowd: Crowd;
  readonly count: number;
  readonly drawCalls: number;
  readonly triangleCount: number;
  // One call so the walk cycle and the walk are stepped by the same clamped, scaled dt.
  // A zero dt still writes: who is too small to draw follows the camera, not the clock.
  advance(dt: number, scale: number): void;
  setView(view: DetailView | null): void;
  readonly drawnCount: number;
  relocate(network: WalkNetwork): void;
  dispose(): void;
}

export interface CrowdFieldOptions {
  readonly crowd: Crowd;
  // A person's variant indexes this, in people registry order.
  readonly models: readonly ModelGeometry[];
  readonly lightVolume?: BakedLightVolume | null;
}

interface PersonMesh {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly people: Int32Array;
  readonly triangles: number;
  readonly height: number;
  readonly pose: InstancedBufferAttribute;
}

function buildPersonMesh(
  model: ModelGeometry,
  material: MeshStandardNodeMaterial,
  crowd: Crowd,
  variant: number,
): PersonMesh | null {
  const people: number[] = [];
  for (let i = 0; i < crowd.count; i++) if (crowd.variant[i] === variant) people.push(i);
  if (people.length === 0) return null;

  const geometry = figureGeometry(model, people.length);
  const mesh = new InstancedMesh(geometry, material, people.length);
  mesh.name = `crowd-${model.id}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance moves every frame, so culling would need a per-frame bounding sphere recompute.
  mesh.frustumCulled = false;

  const matrices = mesh.instanceMatrix.array;
  for (let slot = 0; slot < people.length; slot++) {
    // The buffer is zero-filled, so the constant entries are written once and a frame writes seven numbers per person.
    matrices[slot * 16 + 5] = 1;
    matrices[slot * 16 + 15] = 1;
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return {
    mesh,
    geometry,
    people: Int32Array.from(people),
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    height: box.max.y - box.min.y,
    pose: geometry.getAttribute('pose') as InstancedBufferAttribute,
  };
}

// Column-major, and the figure faces +z, so the yaw matches crowd.ts's atan2(dx, dz).
function writeInstances(part: PersonMesh, crowd: Crowd, view: DetailView | null): number {
  const matrices = part.mesh.instanceMatrix.array;
  const pose = part.pose.array;
  const middle = part.height / 2;
  let slot = 0;
  for (let index = 0; index < part.people.length; index++) {
    const person = part.people[index]!;
    if (person >= crowd.count) break;
    // continue, not break: slot 7 being empty says nothing about slot 8.
    if (crowd.offPlot[person] === 1) continue;
    if (view) {
      const dx = crowd.x[person]! - view.x;
      const dy = crowd.y[person]! + middle - view.y;
      const dz = crowd.z[person]! - view.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!standsOut(pixelsPerVoxel(view.lens, distance), part.height)) continue;
    }
    const heading = crowd.heading[person]!;
    const yawCos = Math.cos(heading);
    const yawSin = Math.sin(heading);
    const at = slot * 16;
    matrices[at] = yawCos;
    matrices[at + 2] = -yawSin;
    matrices[at + 8] = yawSin;
    matrices[at + 10] = yawCos;
    matrices[at + 12] = crowd.x[person]!;
    matrices[at + 13] = crowd.y[person]!;
    matrices[at + 14] = crowd.z[person]!;
    const packed = slot * POSE_STRIDE;
    pose[packed + POSE_SIN] = yawSin;
    pose[packed + POSE_COS] = yawCos;
    pose[packed + POSE_RESTING] = restingOn(crowd, person);
    pose[packed + POSE_PHASE] = crowd.phase[person]!;
    slot++;
  }
  part.mesh.count = slot;
  part.mesh.instanceMatrix.needsUpdate = true;
  part.pose.needsUpdate = true;
  return slot;
}

export function buildCrowdField(options: CrowdFieldOptions): CrowdField {
  // Rebound by relocate, so closures must read this binding rather than hold a crowd of their own.
  let crowd = options.crowd;
  const { models } = options;
  const group = new Group();
  group.name = 'crowd';

  const walk = figureMaterial(options.lightVolume ?? null);
  const parts: PersonMesh[] = [];
  for (const [variant, model] of models.entries()) {
    const part = buildPersonMesh(model, walk.material, crowd, variant);
    if (!part) continue;
    parts.push(part);
    group.add(part.mesh);
  }

  let clock = 0;
  let view: DetailView | null = null;
  let drawnCount = 0;
  const writeAll = (): void => {
    drawnCount = 0;
    for (const part of parts) drawnCount += writeInstances(part, crowd, view);
  };
  writeAll();

  return {
    group,
    get crowd() {
      return crowd;
    },
    get count() {
      return crowd.count;
    },
    get drawnCount() {
      return drawnCount;
    },
    setView(next) {
      view = next;
    },
    drawCalls: parts.length,
    triangleCount: parts.reduce((total, part) => total + part.triangles * part.people.length, 0),
    advance(dt, scale) {
      // Clamped so a backgrounded tab neither teleports the crowd nor spins its legs; legs swing at the same
      // scale or a hurrying guest would glide on a stroll's stride.
      const step = Math.min(Math.max(dt, 0), MAX_STEP) * scale;
      // `> 0` so a NaN from either factor is refused along with a paused frame.
      if (step > 0) {
        stepCrowd(crowd, step);
        clock += step;
        walk.setClock(clock);
      }
      writeAll();
    },
    relocate(network) {
      crowd = reseatCrowd(crowd, network);
      // Now rather than next frame, so nobody is drawn where the old graph had them.
      writeAll();
    },
    dispose() {
      for (const part of parts) {
        part.mesh.dispose();
        // This field's own clone; the model geometry belongs to the meshed catalogue and outlives every resort.
        part.geometry.dispose();
      }
      group.clear();
      walk.material.dispose();
    },
  };
}
