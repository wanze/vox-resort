import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Vector3,
  type InstancedMesh,
} from 'three/webgpu';
import { ADULT_VOXELS, CHILD_VOXELS } from '../../../../voxel-gen/people/figure.ts';
import { RESTING } from '../../crowd/domain/crowd';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { createFlotilla, type Flotilla } from '../domain/flotilla';
import { createPassengers, poseAboard, type Berth, type Passengers } from '../domain/passengers';
import type { SailingGround } from '../domain/swimArea';
import { buildCrewField } from './crewField';

const GROUND: SailingGround = { westX: 0, eastX: 400, seawardZ: 700, landwardZ: () => 560 };

/** The two berths the test's one boat model offers: a rower and a passenger. */
const BOAT = 1;
const HIRE = 2;
const BERTHS: readonly (readonly Berth[])[] = [
  [],
  [
    { x: 0, y: 4, z: 2, heading: Math.PI },
    { x: 0, y: 5, z: -2, heading: 0 },
  ],
  [{ x: -1, y: 3, z: -1, heading: 0 }],
];

/**
 * A figure's worth of geometry: the eight corners of a `3 x height x 2` box,
 * which is the extent a person model comes out of the mesher at.
 *
 * The same stand-in `crowdField.test.ts` uses, and for the same reason: the
 * corners are all the field reads of a figure.
 */
function personGeometry(id: string, height: number): ModelGeometry {
  const corners: number[] = [];
  for (const x of [0, 3]) {
    for (const y of [0, height]) {
      for (const z of [0, 2]) corners.push(x, y, z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(corners), 3));
  geometry.setIndex(
    new BufferAttribute(
      Uint16Array.from({ length: 24 }, (_, i) => i % 8),
      1,
    ),
  );
  return {
    id,
    lit: geometry,
    emissive: null,
    water: null,
    window: null,
    triangleCount: 8,
    unmergedTriangleCount: 8,
  };
}

const MODELS: readonly ModelGeometry[] = [
  personGeometry('guest-a', ADULT_VOXELS),
  personGeometry('child', CHILD_VOXELS),
];

/** A bay of private boats and, if asked, the rental's own. */
const bay = (craft: number, hire = 0): Flotilla =>
  createFlotilla({
    moorings: [{ x: 40, z: 520 }],
    buoyVariant: 0,
    craft,
    craftVariants: [BOAT],
    hire: hire > 0 ? { count: hire, variant: HIRE, rental: { x: 120, z: 500 } } : null,
    ground: GROUND,
    waterline: 0.5,
    seed: 7,
  });

const crewOf = (flotilla: Flotilla, variants = MODELS.length, seed = 3): Passengers =>
  createPassengers({ flotilla, berths: BERTHS, variants, seed });

const fieldFor = (
  flotilla: Flotilla,
  passengers: Passengers,
  models: readonly ModelGeometry[] = MODELS,
): ReturnType<typeof buildCrewField> => buildCrewField({ flotilla, passengers, models });

const meshes = (group: { children: unknown[] }): InstancedMesh[] =>
  group.children as InstancedMesh[];

/** The world up axis a mesh's slot was turned to: the figure's own up. */
const upIn = (matrix: Matrix4): Vector3 =>
  new Vector3(matrix.elements[4]!, matrix.elements[5]!, matrix.elements[6]!);

/** The translation written into one slot of a mesh. */
function positionIn(mesh: InstancedMesh, slot: number): Vector3 {
  const matrix = new Matrix4().fromArray(mesh.instanceMatrix.array, slot * 16);
  return new Vector3().setFromMatrixPosition(matrix);
}

/** Which passengers a model's mesh may draw, in the slot order it hands out. */
const membersOf = (passengers: Passengers, variant: number): number[] =>
  Array.from({ length: passengers.count }, (_, index) => index).filter(
    (index) => passengers.variant[index] === variant,
  );

describe('buildCrewField', () => {
  it('draws one mesh per person model somebody afloat is drawn in, and never culls it', () => {
    const flotilla = bay(20);
    const field = fieldFor(flotilla, crewOf(flotilla));
    expect(field.drawCalls).toBe(MODELS.length);
    for (const mesh of meshes(field.group)) {
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.name.startsWith('sea-crew-')).toBe(true);
    }
  });

  it('gives a mesh only to a model somebody is actually drawn in', () => {
    const flotilla = bay(20);
    // Everybody in the first model, so the second is never asked for.
    const field = fieldFor(flotilla, crewOf(flotilla, 1));
    expect(field.drawCalls).toBe(1);
  });

  it('seats every passenger where the berth on their craft puts them', () => {
    const flotilla = bay(8);
    const passengers = crewOf(flotilla);
    const field = fieldFor(flotilla, passengers);
    for (const [variant, mesh] of meshes(field.group).entries()) {
      for (const [slot, person] of membersOf(passengers, variant).entries()) {
        const pose = poseAboard(flotilla, passengers, person);
        const at = positionIn(mesh, slot);
        expect(at.x).toBeCloseTo(pose.x);
        expect(at.y).toBeCloseTo(pose.y);
        expect(at.z).toBeCloseTo(pose.z);
      }
    }
  });

  it('hands the shader the direction each sitter’s legs point', () => {
    const flotilla = bay(8);
    const passengers = crewOf(flotilla);
    const field = fieldFor(flotilla, passengers);
    for (const [variant, mesh] of meshes(field.group).entries()) {
      const facing = mesh.geometry.getAttribute('pose');
      for (const [slot, person] of membersOf(passengers, variant).entries()) {
        const pose = poseAboard(flotilla, passengers, person);
        // The berth's own turn included, which is what puts a rower's legs
        // towards the stern rather than the bow.
        expect(facing.getX(slot)).toBeCloseTo(Math.sin(pose.heading));
        expect(facing.getY(slot)).toBeCloseTo(Math.cos(pose.heading));
      }
    }
  });

  it('marks everybody aboard as sitting, once and for good', () => {
    const flotilla = bay(8);
    const field = fieldFor(flotilla, crewOf(flotilla));
    for (const mesh of meshes(field.group)) {
      const pose = mesh.geometry.getAttribute('pose');
      for (let slot = 0; slot < pose.count; slot++) {
        expect(pose.getZ(slot)).toBe(RESTING.sitting);
      }
    }
  });

  it('heels a figure with the hull it is sitting in', () => {
    const flotilla = bay(1);
    flotilla.ride[1] = 0;
    flotilla.heading[1] = 0;
    const passengers = crewOf(flotilla);
    const field = fieldFor(flotilla, passengers);

    const upright = meshes(field.group).find((mesh) => mesh.count > 0)!;
    const level = new Matrix4().fromArray(upright.instanceMatrix.array, 0);

    // A quarter of the roll's period on, which is where the heel is largest.
    flotilla.clock = Math.PI / 2 / 0.83;
    field.write();
    const heeled = new Matrix4().fromArray(upright.instanceMatrix.array, 0);

    expect(upIn(level).angleTo(new Vector3(0, 1, 0))).toBeCloseTo(0);
    expect(upIn(heeled).angleTo(new Vector3(0, 1, 0))).toBeGreaterThan(0.01);
  });

  it('draws nobody on a hire boat lying at its berth, and everybody when it goes out', () => {
    const flotilla = bay(0, 4);
    const passengers = crewOf(flotilla);
    const field = fieldFor(flotilla, passengers);
    expect(passengers.count).toBe(4);

    // Every boat tied up: the whole crew is off the water and undrawn, and the
    // draw calls go with them, because a zero-instance mesh is not drawn.
    for (let index = 0; index < flotilla.count; index++) flotilla.age[index] = -1;
    field.write();
    expect(field.count).toBe(0);
    expect(field.triangleCount).toBe(0);
    expect(field.drawCalls).toBe(0);
    for (const mesh of meshes(field.group)) expect(mesh.count).toBe(0);

    // And every boat out again: everybody back, and the draw back with them.
    for (let index = 0; index < flotilla.count; index++) flotilla.age[index] = 1;
    field.write();
    expect(field.count).toBe(4);
    expect(field.triangleCount).toBeGreaterThan(0);
    expect(field.drawCalls).toBeGreaterThan(0);
  });

  it('writes whoever is left into the front of the buffer', () => {
    // The compaction, which is the one thing a shortened draw depends on: with
    // the first of a mesh's passengers ashore, the second has to be in slot 0
    // or the draw of one instance would draw an empty berth.
    const flotilla = bay(0, 6);
    const passengers = crewOf(flotilla, 1);
    const field = fieldFor(flotilla, passengers);
    const mesh = meshes(field.group)[0]!;
    expect(passengers.count).toBeGreaterThan(1);

    for (let index = 0; index < flotilla.count; index++) flotilla.age[index] = 1;
    flotilla.age[passengers.craft[0]!] = -1;
    field.write();

    expect(mesh.count).toBe(passengers.count - 1);
    const pose = poseAboard(flotilla, passengers, 1);
    const at = positionIn(mesh, 0);
    expect(at.x).toBeCloseTo(pose.x);
    expect(at.z).toBeCloseTo(pose.z);
  });

  it('follows the boats, so a passenger moves when the bay does', () => {
    const flotilla = bay(6);
    const passengers = crewOf(flotilla, 1);
    const field = fieldFor(flotilla, passengers);
    const mesh = meshes(field.group)[0]!;
    const before = positionIn(mesh, 0);

    for (let index = 0; index < flotilla.count; index++) flotilla.x[index]! += 10;
    field.write();
    expect(positionIn(mesh, 0).x).toBeCloseTo(before.x + 10);
  });

  it('draws nothing on a bay with nobody afloat', () => {
    const flotilla = bay(0);
    const field = fieldFor(flotilla, crewOf(flotilla));
    expect(field.drawCalls).toBe(0);
    expect(field.count).toBe(0);
    expect(field.triangleCount).toBe(0);
    field.write();
    expect(field.group.children).toHaveLength(0);
  });

  it('empties the group on dispose', () => {
    const flotilla = bay(8);
    const field = fieldFor(flotilla, crewOf(flotilla));
    expect(field.group.children.length).toBeGreaterThan(0);
    field.dispose();
    expect(field.group.children).toHaveLength(0);
  });
});
