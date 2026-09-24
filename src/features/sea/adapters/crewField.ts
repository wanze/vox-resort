import {
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedBufferAttribute,
  type Material,
} from 'three/webgpu';
import { RESTING } from '../../crowd/domain/crowd';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  figureGeometry,
  figureMaterial,
  POSE_COS,
  POSE_RESTING,
  POSE_SIN,
  POSE_STRIDE,
} from '../../rendering/adapters/figureField';
import { disposeFieldMeshes, slotsFor, type FieldMesh } from '../../rendering/adapters/movingField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import type { Flotilla } from '../domain/flotilla';
import { aboard, poseAboard, type Passengers } from '../domain/passengers';

export interface CrewField {
  readonly group: Group;
  readonly count: number;
  // Read on demand: a mesh whose crew is ashore has its count cut to 0, and RenderObject skips it.
  readonly drawCalls: number;
  readonly triangleCount: number;
  // Called by the sea field after it steps the flotilla, since positions follow this frame's hulls.
  write(): void;
  dispose(): void;
}

export interface CrewFieldOptions {
  readonly flotilla: Flotilla;
  readonly passengers: Passengers;
  readonly models: readonly ModelGeometry[];
  readonly lightVolume?: BakedLightVolume | null;
}

interface CrewMesh extends FieldMesh {
  readonly mesh: InstancedMesh;
  readonly geometry: BufferGeometry;
  readonly pose: InstancedBufferAttribute;
  drawn: number;
}

const attitude = new Matrix4();
const hull = new Euler(0, 0, 0, 'YXZ');
const spin = new Quaternion();
const inBoat = new Quaternion();
const at = new Vector3();
const UP = new Vector3(0, 1, 0);
const UNSCALED = new Vector3(1, 1, 1);

// Undrawn passengers are compacted out rather than zero-scaled: positionNode displaces after the
// instance matrix, so a zero scale leaves the seated fold behind as stray voxels.
// The berth's turn composes inside the hull's attitude, or heel and trim mirror on a figure facing astern.
function writeInstances(part: CrewMesh, flotilla: Flotilla, passengers: Passengers): void {
  const matrices = part.mesh.instanceMatrix.array;
  const packed = part.pose.array;
  let slot = 0;
  for (const person of part.members) {
    if (!aboard(flotilla, passengers, person)) continue;
    const pose = poseAboard(flotilla, passengers, person);
    hull.set(pose.pitch, pose.bow, pose.roll);
    spin.setFromEuler(hull);
    inBoat.setFromAxisAngle(UP, pose.heading - pose.bow);
    spin.multiply(inBoat);
    at.set(pose.x, pose.y, pose.z);
    attitude.compose(at, spin, UNSCALED);
    attitude.toArray(matrices, slot * 16);
    packed[slot * POSE_STRIDE + POSE_SIN] = Math.sin(pose.heading);
    packed[slot * POSE_STRIDE + POSE_COS] = Math.cos(pose.heading);
    slot++;
  }
  part.drawn = slot;
  part.mesh.count = slot;
  part.mesh.instanceMatrix.needsUpdate = true;
  part.pose.needsUpdate = true;
}

function buildCrewMesh(
  model: ModelGeometry,
  material: Material,
  passengers: Passengers,
  variant: number,
): CrewMesh | null {
  const members = slotsFor(passengers.variant, passengers.count, variant);
  if (members.length === 0) return null;

  const geometry = figureGeometry(model, members.length);
  const pose = geometry.getAttribute('pose') as InstancedBufferAttribute;
  for (let slot = 0; slot < members.length; slot++) {
    pose.array[slot * POSE_STRIDE + POSE_RESTING] = RESTING.sitting;
  }

  const mesh = new InstancedMesh(geometry, material, members.length);
  mesh.name = `sea-crew-${model.id}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance moves every frame, so a bounding sphere would have to be recomputed every frame.
  mesh.frustumCulled = false;
  return {
    mesh,
    geometry,
    members,
    triangles: (geometry.getIndex()?.count ?? 0) / 3,
    pose,
    drawn: 0,
  };
}

const drawnIn = (parts: readonly CrewMesh[]): number =>
  parts.reduce((total, part) => total + part.drawn, 0);

const drawingIn = (parts: readonly CrewMesh[]): number =>
  parts.reduce((total, part) => total + Math.min(part.drawn, 1), 0);

export function buildCrewField(options: CrewFieldOptions): CrewField {
  const { flotilla, passengers, models } = options;
  const group = new Group();
  group.name = 'sea-crew';

  const figure = figureMaterial(options.lightVolume ?? null);
  const parts: CrewMesh[] = [];
  for (const [variant, model] of models.entries()) {
    const part = buildCrewMesh(model, figure.material, passengers, variant);
    if (!part) continue;
    parts.push(part);
    group.add(part.mesh);
    writeInstances(part, flotilla, passengers);
  }

  return {
    group,
    get count() {
      return drawnIn(parts);
    },
    get drawCalls() {
      return drawingIn(parts);
    },
    get triangleCount() {
      return parts.reduce((total, part) => total + part.triangles * part.drawn, 0);
    },
    write() {
      for (const part of parts) writeInstances(part, flotilla, passengers);
    },
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      figure.material.dispose();
    },
  };
}
