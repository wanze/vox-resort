// Sea models are drawn from their waterline up, so the hung geometry's origin is where the
// sea cuts the hull: the swell lifts a boat by one number and the roll heels it about its keel.

import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
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
import { MAX_STEP, poseOf, stepFlotilla, type Flotilla } from '../domain/flotilla';
import type { Passengers } from '../domain/passengers';
import type { SailingGround } from '../domain/swimArea';
import { buildCrewField } from './crewField';

export interface SeaField {
  readonly group: Group;
  readonly count: number;
  readonly crewCount: number;
  readonly drawCalls: number;
  readonly triangleCount: number;
  advance(dt: number): void;
  dispose(): void;
}

export interface SeaFieldOptions {
  readonly flotilla: Flotilla;
  readonly ground: SailingGround;
  readonly models: readonly ModelGeometry[];
  readonly crew: SeaCrewOptions;
  readonly lightVolume?: BakedLightVolume | null;
}

export interface SeaCrewOptions {
  readonly passengers: Passengers;
  readonly models: readonly ModelGeometry[];
}

const attitude = new Matrix4();
const turned = new Euler(0, 0, 0, 'YXZ');
const spin = new Quaternion();
const at = new Vector3();
const UNSCALED = new Vector3(1, 1, 1);

// Uploaded whole: even a moored buoy rides the swell.
function writeInstances(part: FieldMesh, flotilla: Flotilla): void {
  const matrices = part.mesh.instanceMatrix.array;
  for (let slot = 0; slot < part.members.length; slot++) {
    const pose = poseOf(flotilla, part.members[slot]!);
    // YXZ: yaw first, then pitch and roll about the hull's own axes.
    turned.set(pose.pitch, pose.heading, pose.roll);
    spin.setFromEuler(turned);
    at.set(pose.x, pose.y, pose.z);
    attitude.compose(at, spin, UNSCALED);
    attitude.toArray(matrices, slot * 16);
  }
  part.mesh.instanceMatrix.needsUpdate = true;
}

export function buildSeaField(options: SeaFieldOptions): SeaField {
  const { flotilla, models, ground } = options;
  const group = new Group();
  group.name = 'sea';

  const { lit, glow, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);

  const parts = models.flatMap((model, variant) =>
    fieldMeshesFor({
      name: `sea-${model.id}`,
      members: slotsFor(flotilla.variant, flotilla.count, variant),
      surfaces: [
        { kind: 'lit', source: model.lit, material: lit },
        { kind: 'glow', source: model.emissive, material: glow },
      ],
    }),
  );
  for (const part of parts) {
    group.add(part.mesh);
    writeInstances(part, flotilla);
  }

  const crew = buildCrewField({
    flotilla,
    passengers: options.crew.passengers,
    models: options.crew.models,
    lightVolume: options.lightVolume ?? null,
  });
  group.add(crew.group);

  const hulls = fieldTriangles(parts);
  return {
    group,
    get count() {
      return flotilla.count;
    },
    get crewCount() {
      return crew.count;
    },
    get drawCalls() {
      return parts.length + crew.drawCalls;
    },
    get triangleCount() {
      return hulls + crew.triangleCount;
    },
    advance(dt) {
      const step = Math.min(Math.max(dt, 0), MAX_STEP);
      if (step === 0) return;
      stepFlotilla(flotilla, step, ground);
      for (const part of parts) writeInstances(part, flotilla);
      // After the hulls: a passenger sits in the boat as it is this frame, not last frame.
      crew.write();
    },
    dispose() {
      crew.dispose();
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
