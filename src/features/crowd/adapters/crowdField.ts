import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type MeshStandardNodeMaterial,
} from 'three/webgpu';
import { SHOWN, type DrawnAs } from '../../choreography/domain/casting';
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
import { standTurned } from '../../rendering/adapters/movingField';
import { CHAIR_SEAT_VOXELS } from '../../../../voxel-gen/props/wheelchair.ts';
import { WHEELCHAIR_SHARE } from '../../guests/domain/parties';
import { MAX_STEP, reseatCrowd, RESTING, restingOn, stepCrowd, type Crowd } from '../domain/crowd';
import type { WalkNetwork } from '../domain/walkNetwork';
import { buildChairField, type ChairField } from './chairField';

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
  // A rebuild renumbers the places, so it hands over a new cast rather than a new field.
  drawAs(next: DrawnAs | null): void;
  readonly drawnCount: number;
  // `holds` names who the sim keeps where they stand; reseatCrowd says how.
  relocate(network: WalkNetwork, holds?: (person: number) => boolean): void;
  // Takes a restored crowd as it is, where relocate would re-anchor everybody.
  adopt(crowd: Crowd): void;
  dispose(): void;
}

export interface CrowdFieldOptions {
  readonly crowd: Crowd;
  // A person's variant indexes this, in people registry order.
  readonly models: readonly ModelGeometry[];
  readonly lightVolume?: BakedLightVolume | null;
  // Drawn over the crowd, never written into it: the sim steers the crowd and must not see this.
  readonly drawnAs?: DrawnAs;
  // Left out, nobody is drawn in a wheelchair.
  readonly chair?: ModelGeometry;
}

// Parties are a few people each, so this is room for twice the share's worth of users.
const chairsFor = (capacity: number): number => Math.ceil(capacity * WHEELCHAIR_SHARE) + 8;

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
  // Capacity, not count: the mesh is sized once, for every body the crowd will ever hold.
  for (let i = 0; i < crowd.capacity; i++) if (crowd.variant[i] === variant) people.push(i);
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

const tooSmall = (
  view: DetailView | null,
  x: number,
  y: number,
  z: number,
  height: number,
): boolean => {
  if (!view) return false;
  const dx = x - view.x;
  const dy = y + height / 2 - view.y;
  const dz = z - view.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return !standsOut(pixelsPerVoxel(view.lens, distance), height);
};

// continue, not break, for whoever is not drawn: slot 7 being empty says nothing about slot 8.
const isDrawn = (crowd: Crowd, drawnAs: DrawnAs | null, person: number): boolean =>
  crowd.offPlot[person] !== 1 && drawnAs?.shown[person] !== SHOWN.hidden;

const placedIn = (drawnAs: DrawnAs | null, person: number): DrawnAs | null =>
  drawnAs?.shown[person] === SHOWN.placed ? drawnAs : null;

const restingOf = (crowd: Crowd, placed: DrawnAs | null, person: number): number =>
  placed ? placed.pose[person]! : restingOn(crowd, person);

// Sat in the chair wherever they are drawn: the hips stay where a sitting pose put them, and go a
// seat's height above wherever anything else stood them. Answers the height the figure is drawn at.
function seatInChair(
  chairs: ChairField | null,
  at: { readonly x: number; readonly y: number; readonly z: number },
  resting: number,
  yaw: { readonly cos: number; readonly sin: number },
): number {
  const hip = resting === RESTING.sitting ? at.y : at.y + CHAIR_SEAT_VOXELS;
  chairs?.put(at.x, hip - CHAIR_SEAT_VOXELS, at.z, yaw.cos, yaw.sin);
  return hip;
}

// Column-major, and the figure faces +z, so the yaw matches crowd.ts's atan2(dx, dz).
function writeInstances(
  part: PersonMesh,
  crowd: Crowd,
  view: DetailView | null,
  drawnAs: DrawnAs | null,
  chairs: ChairField | null,
): number {
  const matrices = part.mesh.instanceMatrix.array;
  const pose = part.pose.array;
  let slot = 0;
  for (let index = 0; index < part.people.length; index++) {
    const person = part.people[index]!;
    if (person >= crowd.count) break;
    if (!isDrawn(crowd, drawnAs, person)) continue;
    const placed = placedIn(drawnAs, person);
    const from = placed ?? crowd;
    const x = from.x[person]!;
    const y = from.y[person]!;
    const z = from.z[person]!;
    if (tooSmall(view, x, y, z, part.height)) continue;
    const heading = from.heading[person]!;
    const yawCos = Math.cos(heading);
    const yawSin = Math.sin(heading);
    const resting = restingOf(crowd, placed, person);
    const seated = drawnAs?.chair[person] === 1;
    const drawnY = seated
      ? seatInChair(chairs, { x, y, z }, resting, { cos: yawCos, sin: yawSin })
      : y;
    standTurned(matrices as Float32Array, slot, { x, y: drawnY, z }, yawCos, yawSin);
    const packed = slot * POSE_STRIDE;
    pose[packed + POSE_SIN] = yawSin;
    pose[packed + POSE_COS] = yawCos;
    pose[packed + POSE_RESTING] = seated ? RESTING.sitting : resting;
    // The person's own, placed or not, so the walk cycle does not jump when they are let go.
    pose[packed + POSE_PHASE] = crowd.phase[person]!;
    slot++;
  }
  part.mesh.count = slot;
  // Cleared first: three copies these ranges into a big mesh's own buffer without clearing them.
  part.mesh.instanceMatrix.clearUpdateRanges();
  part.mesh.instanceMatrix.addUpdateRange(0, slot * 16);
  part.mesh.instanceMatrix.needsUpdate = true;
  part.pose.clearUpdateRanges();
  part.pose.addUpdateRange(0, slot * POSE_STRIDE);
  part.pose.needsUpdate = true;
  return slot;
}

export function buildCrowdField(options: CrowdFieldOptions): CrowdField {
  // Rebound by relocate, so closures must read this binding rather than hold a crowd of their own.
  let crowd = options.crowd;
  const { models } = options;
  let drawnAs = options.drawnAs ?? null;
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

  const chairs = options.chair
    ? buildChairField({
        model: options.chair,
        capacity: chairsFor(crowd.capacity),
        lightVolume: options.lightVolume ?? null,
      })
    : null;
  if (chairs) group.add(chairs.group);

  const triangles = parts.reduce((total, part) => total + part.triangles * part.people.length, 0);
  let clock = 0;
  let view: DetailView | null = null;
  let drawnCount = 0;
  const writeAll = (): void => {
    drawnCount = 0;
    chairs?.begin();
    for (const part of parts) drawnCount += writeInstances(part, crowd, view, drawnAs, chairs);
    chairs?.end();
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
    drawAs(next) {
      drawnAs = next;
      writeAll();
    },
    // Empty meshes are skipped by the renderer, so the HUD must not count them either.
    get drawCalls() {
      return (drawnCount === 0 ? 0 : parts.length) + (chairs?.drawCalls ?? 0);
    },
    get triangleCount() {
      return (drawnCount === 0 ? 0 : triangles) + (chairs?.triangleCount ?? 0);
    },
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
    relocate(network, holds) {
      crowd = reseatCrowd(crowd, network, holds);
      // Now rather than next frame, so nobody is drawn where the old graph had them.
      writeAll();
    },
    adopt(next) {
      crowd = next;
      writeAll();
    },
    dispose() {
      for (const part of parts) {
        part.mesh.dispose();
        // This field's own clone; the model geometry belongs to the meshed catalogue and outlives every resort.
        part.geometry.dispose();
      }
      chairs?.dispose();
      group.clear();
      walk.material.dispose();
    },
  };
}
