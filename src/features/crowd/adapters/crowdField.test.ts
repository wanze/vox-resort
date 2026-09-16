import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Vector3,
  type InstancedMesh,
} from 'three/webgpu';
import { ADULT_VOXELS, CHILD_VOXELS, hipHeight } from '../../../../voxel-gen/people/figure.ts';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import { orthographicLens } from '../../rendering/domain/levelOfDetail';
import { createCrowd, putOnPlot, takeOffPlot, type Crowd } from '../domain/crowd';
import { walkNetworkFor, type PavedTile } from '../domain/walkNetwork';
import { buildCrowdField } from './crowdField';

/** A short run of paving to walk up and down, all at sea level. */
const paved = (count: number): PavedTile[] =>
  Array.from({ length: count }, (_, tileZ) => ({ tileX: 0, tileZ, y: 0 }));

const networkOf = (tiles: readonly PavedTile[]): ReturnType<typeof walkNetworkFor> =>
  walkNetworkFor({ paved: tiles, levelOf: () => 0, shore: null, tilesX: 1 });

/**
 * A figure's worth of geometry: the eight corners of a `3 x height x 2` box,
 * which is the extent a person model comes out of the mesher at.
 *
 * The corners are what the field reads — it centres the model on them and
 * weights each vertex by how far below the hip it sits — so a box says
 * everything about a figure that this file needs to ask.
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

/** WebGPU's default `maxVertexBuffers`, which Three.js does not raise. */
const MAX_VERTEX_BUFFERS = 8;

/** Matrices a default 64 KiB uniform buffer holds, which is where Three.js stops using one. */
const UNIFORM_MATRICES = 65_536 / 64;

/**
 * Vertex buffers a mesh binds in the pipeline: one per distinct buffer behind
 * its attributes, plus one for the instance matrices once there are too many
 * of them for a uniform buffer. The normal and the colour are counted too,
 * because the catalogue's person models carry them even where this stand-in
 * does not.
 */
function vertexBuffersOf(mesh: InstancedMesh): number {
  const buffers = new Set<unknown>();
  for (const attribute of Object.values(mesh.geometry.attributes)) {
    buffers.add('data' in attribute ? attribute.data : attribute);
  }
  for (const name of ['normal', 'color']) {
    if (!mesh.geometry.getAttribute(name)) buffers.add(name);
  }
  const matrices = mesh.instanceMatrix.count > UNIFORM_MATRICES ? 1 : 0;
  return buffers.size + matrices;
}

const crowdOf = (count: number, tiles = 6): Crowd =>
  createCrowd({ network: networkOf(paved(tiles)), count, variants: MODELS.length, seed: 1 });

const meshes = (group: { children: unknown[] }): InstancedMesh[] =>
  group.children as InstancedMesh[];

/** Where one instance of one mesh has been put, in world voxels. */
function positionOf(mesh: InstancedMesh, slot: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(slot, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

describe('buildCrowdField', () => {
  it('draws one mesh per person model, and never culls it', () => {
    const field = buildCrowdField({ crowd: crowdOf(40), models: MODELS });
    expect(meshes(field.group)).toHaveLength(MODELS.length);
    for (const mesh of meshes(field.group)) {
      expect(mesh.frustumCulled, mesh.name).toBe(false);
      expect(mesh.count).toBeGreaterThan(0);
    }
    // Everybody is drawn exactly once, whichever model they walk in.
    const drawn = meshes(field.group).reduce((total, mesh) => total + mesh.count, 0);
    expect(drawn).toBe(field.count);
    // One draw call each, and the triangles of everybody standing in them: the
    // HUD and a bench report both read these back off the renderer.
    expect(field.drawCalls).toBe(MODELS.length);
    expect(field.triangleCount).toBe(field.count * 8);
    field.dispose();
  });

  it('leaves out of the draw, not the walk, everybody too small to see', () => {
    const field = buildCrowdField({ crowd: crowdOf(40), models: MODELS });
    // A hundredth of a pixel per voxel: nobody is more than a speck.
    field.setView({ x: 0, y: 0, z: 0, lens: orthographicLens(1, 100) });
    field.advance(1 / 60, 1);
    expect(field.drawnCount).toBe(0);
    for (const mesh of meshes(field.group)) expect(mesh.count, mesh.name).toBe(0);

    // Four pixels per voxel: everybody stands out again, and all are drawn.
    field.setView({ x: 0, y: 0, z: 0, lens: orthographicLens(400, 100) });
    field.advance(1 / 60, 1);
    expect(field.drawnCount).toBe(field.count);
    field.setView(null);
    field.advance(1 / 60, 1);
    const drawn = meshes(field.group).reduce((total, mesh) => total + mesh.count, 0);
    expect(drawn).toBe(field.count);
    field.dispose();
  });

  it('draws nobody who is off the plot, and keeps drawing everybody after them', () => {
    const crowd = crowdOf(6);
    const field = buildCrowdField({ crowd, models: MODELS });
    field.advance(1 / 60, 1);
    expect(field.drawnCount).toBe(6);

    // Two bodies emptied, one of them not the last: a `break` in the write loop
    // would drop everybody behind it and the plot would look deserted.
    takeOffPlot(crowd, 1, crowd.x[1]!, crowd.y[1]!, crowd.z[1]!);
    takeOffPlot(crowd, 4, crowd.x[4]!, crowd.y[4]!, crowd.z[4]!);
    field.advance(1 / 60, 1);
    expect(field.drawnCount).toBe(4);
    const drawn = meshes(field.group).reduce((total, mesh) => total + mesh.count, 0);
    expect(drawn).toBe(4);

    putOnPlot(crowd, 1, 0);
    field.advance(1 / 60, 1);
    expect(field.drawnCount).toBe(5);
    field.dispose();
  });

  it('keeps a person’s walk phase with them when others drop out of the draw', () => {
    const crowd = crowdOf(40);
    const field = buildCrowdField({ crowd, models: MODELS });
    field.setView({ x: 0, y: 0, z: 0, lens: orthographicLens(400, 100) });
    field.advance(1 / 60, 1);
    for (const mesh of meshes(field.group)) {
      const pose = mesh.geometry.getAttribute('pose');
      const phases = new Set(Array.from({ length: mesh.count }, (_, slot) => pose.getW(slot)));
      const expected = new Set<number>();
      for (let person = 0; person < crowd.count; person++) {
        if (MODELS[crowd.variant[person]!]!.id === mesh.name.replace('crowd-', '')) {
          expected.add(Math.fround(crowd.phase[person]!));
        }
      }
      expect(phases).toEqual(expected);
    }
    field.dispose();
  });

  it('gives a mesh only to a model somebody actually walks in', () => {
    // One person, so at most one of the two models is ever instanced — and an
    // empty mesh is a draw call for nothing.
    const field = buildCrowdField({ crowd: crowdOf(1), models: MODELS });
    expect(meshes(field.group)).toHaveLength(1);
    field.dispose();
  });

  it('stands each person where the crowd says they are', () => {
    const crowd = crowdOf(30);
    const field = buildCrowdField({ crowd, models: MODELS });
    const standing = meshes(field.group).flatMap((mesh) =>
      Array.from({ length: mesh.count }, (_, slot) => positionOf(mesh, slot)),
    );
    for (let i = 0; i < crowd.count; i++) {
      const here = standing.find(
        (at) => Math.abs(at.x - crowd.x[i]!) < 1e-3 && Math.abs(at.z - crowd.z[i]!) < 1e-3,
      );
      expect(here, `nobody was drawn where person ${i} is`).toBeDefined();
      expect(here!.y).toBeCloseTo(crowd.y[i]!, 3);
    }
    field.dispose();
  });

  it('turns a person to the way they are walking', () => {
    const crowd = crowdOf(20);
    const field = buildCrowdField({ crowd, models: MODELS });
    const [mesh] = meshes(field.group);
    // Whoever the first mesh draws first: the models are filled in registry
    // order, so that is the first person walking in the first of them.
    const person = [...crowd.variant].indexOf(0);
    const matrix = new Matrix4();
    mesh!.getMatrixAt(0, matrix);
    // The figure is authored facing +z, so its local +z has to come out along
    // the heading `crowd.ts` worked out with `atan2(dx, dz)`. Compared as a
    // direction rather than as an angle, since -pi and pi are the same way.
    const facing = new Vector3(0, 0, 1).transformDirection(matrix);
    const heading = crowd.heading[person]!;
    expect(facing.x).toBeCloseTo(Math.sin(heading), 5);
    expect(facing.z).toBeCloseTo(Math.cos(heading), 5);
    field.dispose();
  });

  it('hands the shader the direction each person is walking', () => {
    // The legs swing along it, and past the instance matrix there is no local
    // +z left for them to swing along — see `walkMaterial`.
    const crowd = crowdOf(20);
    const field = buildCrowdField({ crowd, models: MODELS });
    for (const mesh of meshes(field.group)) {
      const facing = mesh.geometry.getAttribute('pose');
      expect((facing as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute).toBe(
        true,
      );
      const matrix = new Matrix4();
      for (let slot = 0; slot < mesh.count; slot++) {
        mesh.getMatrixAt(slot, matrix);
        const turned = new Vector3(0, 0, 1).transformDirection(matrix);
        expect(facing.getX(slot)).toBeCloseTo(turned.x, 5);
        expect(facing.getY(slot)).toBeCloseTo(turned.z, 5);
      }
    }
    field.dispose();
  });

  it('centres a figure on itself, so a turn is about the person', () => {
    const crowd = crowdOf(20);
    const field = buildCrowdField({ crowd, models: MODELS });
    const [mesh] = meshes(field.group);
    mesh!.geometry.computeBoundingBox();
    const bounds = mesh!.geometry.boundingBox!;
    expect(bounds.min.x).toBeCloseTo(-bounds.max.x, 5);
    expect(bounds.min.z).toBeCloseTo(-bounds.max.z, 5);
    // Feet on the ground, not the middle of the figure: the crowd's `y` is the
    // paving they are standing on.
    expect(bounds.min.y).toBeCloseTo(0, 5);
    field.dispose();
  });

  it('weights the walk from the feet up to the hip, and one leg against the other', () => {
    const field = buildCrowdField({ crowd: crowdOf(40), models: MODELS });
    for (const mesh of meshes(field.group)) {
      const positions = mesh.geometry.getAttribute('position');
      const swing = mesh.geometry.getAttribute('figure');
      expect(swing.count).toBe(positions.count);
      mesh.geometry.computeBoundingBox();
      const height = mesh.geometry.boundingBox!.max.y;
      const hip = hipHeight(height);
      for (let vertex = 0; vertex < swing.count; vertex++) {
        const y = positions.getY(vertex);
        const expected = Math.sign(positions.getX(vertex)) * Math.max(0, (hip - y) / hip);
        expect(swing.getX(vertex)).toBeCloseTo(expected, 5);
      }
    }
    field.dispose();
  });

  it('gives every person a walk cycle of their own, in an instanced attribute', () => {
    const crowd = crowdOf(40);
    const field = buildCrowdField({ crowd, models: MODELS });
    const phases: number[] = [];
    for (const mesh of meshes(field.group)) {
      const pose = mesh.geometry.getAttribute('pose');
      expect((pose as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute).toBe(
        true,
      );
      expect(pose.count).toBe(mesh.count);
      for (let slot = 0; slot < pose.count; slot++) phases.push(pose.getW(slot));
    }
    expect(phases.toSorted()).toEqual([...crowd.phase].toSorted());
    field.dispose();
  });

  it('walks the crowd on, and follows it', () => {
    const crowd = crowdOf(30);
    const field = buildCrowdField({ crowd, models: MODELS });
    const [mesh] = meshes(field.group);
    const before = positionOf(mesh!, 0);
    const uploaded = mesh!.instanceMatrix.version;
    field.advance(1 / 60, 1);
    expect(positionOf(mesh!, 0).distanceTo(before)).toBeGreaterThan(0);
    // The whole buffer goes up, because everybody moved.
    expect(mesh!.instanceMatrix.version).toBeGreaterThan(uploaded);
    for (let slot = 0; slot < mesh!.count; slot++) {
      const at = positionOf(mesh!, slot);
      const person = [...crowd.x.keys()].find(
        (i) => Math.abs(crowd.x[i]! - at.x) < 1e-3 && Math.abs(crowd.z[i]! - at.z) < 1e-3,
      );
      expect(person, `slot ${slot} was left behind`).toBeDefined();
    }
    field.dispose();
  });

  it('holds the crowd still for a frame that reports no time at all', () => {
    const crowd = crowdOf(30);
    const field = buildCrowdField({ crowd, models: MODELS });
    const before = [...crowd.x];
    field.advance(0, 1);
    expect([...crowd.x]).toEqual(before);
    field.dispose();
  });

  it('still follows the camera on a frame that steps nobody, as a paused resort sends', () => {
    const crowd = crowdOf(40);
    const field = buildCrowdField({ crowd, models: MODELS });
    const before = [...crowd.x];
    field.setView({ x: 0, y: 0, z: 0, lens: orthographicLens(1, 100) });
    field.advance(0, 1);
    expect(field.drawnCount).toBe(0);
    expect([...crowd.x]).toEqual(before);
    field.dispose();
  });

  it('walks the crowd a scaled frame, as that many frames of real time would', () => {
    const crowd = crowdOf(30);
    const field = buildCrowdField({ crowd, models: MODELS });
    const twin = crowdOf(30);
    const twinField = buildCrowdField({ crowd: twin, models: MODELS });
    // Two steps of `MAX_STEP` either way, which is what makes them the same walk.
    field.advance(0.05, 4);
    for (let frame = 0; frame < 2; frame++) twinField.advance(0.1, 1);
    for (let i = 0; i < crowd.count; i++) expect(crowd.x[i]).toBeCloseTo(twin.x[i]!, 2);
    // Clamped before it is scaled: a backgrounded tab at four times real time
    // costs four steps, not four minutes.
    const away = crowdOf(30);
    const awayField = buildCrowdField({ crowd: away, models: MODELS });
    const slow = crowdOf(30);
    const slowField = buildCrowdField({ crowd: slow, models: MODELS });
    awayField.advance(60, 4);
    slowField.advance(0.1, 4);
    expect([...away.x]).toEqual([...slow.x]);
    for (const each of [field, twinField, awayField, slowField]) each.dispose();
  });

  it('will not teleport a crowd across the plot after a backgrounded tab', () => {
    // A tab that was away for a minute reports the whole minute as one frame.
    // Clamped, an hour away costs the same step a slow frame does.
    const crowd = crowdOf(30);
    const field = buildCrowdField({ crowd, models: MODELS });
    const long = crowdOf(30);
    const longField = buildCrowdField({ crowd: long, models: MODELS });
    field.advance(0.1, 1);
    longField.advance(3600, 1);
    expect([...long.x]).toEqual([...crowd.x]);
    field.dispose();
    longField.dispose();
  });

  it('fits WebGPU’s vertex buffers however many people walk in one model', () => {
    // Past `UNIFORM_MATRICES` people, Three.js stops handing the instance
    // matrices over in a uniform buffer and makes them a vertex buffer of their
    // own (`nodes/accessors/Instance.js`). A crowd laid out one attribute per
    // number took nine buffers there, WebGPU refused the pipeline, and a large
    // resort drew nobody while a small one drew everybody.
    const field = buildCrowdField({ crowd: crowdOf(3 * UNIFORM_MATRICES, 40), models: MODELS });
    for (const mesh of meshes(field.group)) {
      expect(mesh.instanceMatrix.count, mesh.name).toBeGreaterThan(UNIFORM_MATRICES);
      expect(vertexBuffersOf(mesh), mesh.name).toBeLessThanOrEqual(MAX_VERTEX_BUFFERS);
    }
    field.dispose();
  });

  it('draws nothing on a plot with no paving to walk on', () => {
    const field = buildCrowdField({ crowd: crowdOf(600, 0), models: MODELS });
    expect(field.count).toBe(0);
    expect(meshes(field.group)).toHaveLength(0);
    expect(field.drawCalls).toBe(0);
    expect(field.triangleCount).toBe(0);
    // And a frame costs nothing rather than throwing.
    field.advance(1 / 60, 1);
    field.dispose();
  });

  it('keeps its meshes and draw calls when the crowd is put on a new graph', () => {
    const field = buildCrowdField({ crowd: crowdOf(40), models: MODELS });
    const before = meshes(field.group);
    const drawCalls = field.drawCalls;
    field.relocate(networkOf(paved(12)));
    expect(meshes(field.group)).toEqual(before);
    expect(field.drawCalls).toBe(drawCalls);
    field.dispose();
  });

  it('draws everybody the view admits after a relocate', () => {
    const field = buildCrowdField({ crowd: crowdOf(40), models: MODELS });
    field.relocate(networkOf(paved(3)));
    expect(field.count).toBe(40);
    expect(field.drawnCount).toBe(field.count);
    field.setView({ x: 0, y: 0, z: 0, lens: orthographicLens(1, 100) });
    field.advance(1 / 60, 1);
    expect(field.drawnCount).toBe(0);
    field.dispose();
  });

  it('draws nobody once every path is taken up, and walks them back after', () => {
    const field = buildCrowdField({ crowd: crowdOf(40), models: MODELS });
    field.relocate(networkOf([]));
    expect(field.count).toBe(0);
    expect(field.drawnCount).toBe(0);
    for (const mesh of meshes(field.group)) expect(mesh.count, mesh.name).toBe(0);
    expect(() => field.advance(1 / 60, 1)).not.toThrow();

    field.relocate(networkOf(paved(4)));
    expect(field.count).toBe(40);
    expect(field.drawnCount).toBe(40);
    field.dispose();
  });

  it('still fits WebGPU’s vertex buffers after a relocate', () => {
    // The same guard as above, which exists because nine buffers drew a big
    // resort with nobody in it: a relocate must not grow a buffer on the way.
    const field = buildCrowdField({ crowd: crowdOf(3 * UNIFORM_MATRICES, 40), models: MODELS });
    field.relocate(networkOf(paved(20)));
    field.advance(1 / 60, 1);
    for (const mesh of meshes(field.group)) {
      expect(mesh.instanceMatrix.count, mesh.name).toBeGreaterThan(UNIFORM_MATRICES);
      expect(vertexBuffersOf(mesh), mesh.name).toBeLessThanOrEqual(MAX_VERTEX_BUFFERS);
    }
    field.dispose();
  });

  it('empties the group on dispose', () => {
    const field = buildCrowdField({ crowd: crowdOf(20), models: MODELS });
    field.dispose();
    expect(field.group.children).toHaveLength(0);
  });
});
