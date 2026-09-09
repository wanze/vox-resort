import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Vector3,
  type InstancedMesh,
} from 'three/webgpu';
import type { Placement } from '../../layout/domain/resortLayout';
import { buildInstancedWorld, instancesByType } from './instancedWorld';
import type { ModelGeometry } from './voxelMeshBuilder';

const at = (key: string, id: string, x: number, z = 0, y = 0): Placement => ({
  key,
  id,
  tileX: 0,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x,
  z,
  y,
  width: 16,
  depth: 16,
});

describe('instancesByType', () => {
  it('collects every placement of a type under one key', () => {
    const grouped = instancesByType([
      at('cottage', 'cottage', 0),
      at('path@1,0', 'path', 16),
      at('cottage#2', 'cottage', 32),
    ]);
    expect([...grouped.keys()]).toEqual(['cottage', 'path']);
    expect(grouped.get('cottage')?.map((placement) => placement.x)).toEqual([0, 32]);
  });

  it('keeps plan order inside a group', () => {
    const grouped = instancesByType([at('a', 'hut', 5), at('b', 'hut', 1)]);
    expect(grouped.get('hut')?.map((placement) => placement.key)).toEqual(['a', 'b']);
  });

  it('groups nothing when there is nothing to place', () => {
    expect(instancesByType([]).size).toBe(0);
  });
});

/** A geometry of `triangles` degenerate faces, enough to count and to bound. */
function geometryOf(triangles: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(triangles * 9);
  for (let vertex = 0; vertex < triangles * 3; vertex++) positions[vertex * 3] = vertex % 3;
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const indices = Uint16Array.from({ length: triangles * 3 }, (_, index) => index);
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

function model(id: string, triangles: number, glowing = false): ModelGeometry {
  return {
    id,
    lit: geometryOf(triangles),
    emissive: glowing ? geometryOf(1) : null,
    triangleCount: triangles,
    unmergedTriangleCount: triangles * 2,
  };
}

/** A chunk small enough that a test can put two placements either side of it. */
const CHUNK = 100;

const build = (models: readonly ModelGeometry[], placements: readonly Placement[]) =>
  buildInstancedWorld(models, placements, { chunkVoxels: CHUNK });

const meshNamed = (world: { group: { children: readonly unknown[] } }, name: string) =>
  world.group.children.find((child) => (child as InstancedMesh).name === name) as
    | InstancedMesh
    | undefined;

/** Where each live instance of a mesh stands, in the order its slots hold them. */
function positionsOf(mesh: InstancedMesh): { x: number; z: number }[] {
  const matrix = new Matrix4();
  return Array.from({ length: mesh.count }, (_, slot) => {
    mesh.getMatrixAt(slot, matrix);
    return { x: matrix.elements[12]!, z: matrix.elements[14]! };
  });
}

describe('buildInstancedWorld', () => {
  it('draws a turned placement with the turn folded into its instance matrix', () => {
    // A quarter turn about the origin would leave the model behind the corner it
    // was placed on, so the matrix carries the offset that brings it back — and
    // it is still one geometry in one bucket, which is the whole point of
    // turning an instance rather than meshing a second model.
    const turned: Placement = { ...at('a', 'hut', 64, 32), rotation: 1, width: 44, depth: 30 };
    const world = build([model('hut', 2)], [turned]);
    const mesh = meshNamed(world, 'hut@0,0')!;
    const matrix = new Matrix4();
    mesh.getMatrixAt(0, matrix);

    const corners = [new Vector3(0, 0, 0), new Vector3(30, 0, 44)].map((corner) =>
      corner.applyMatrix4(matrix),
    );
    // The model's own box, turned, lands exactly on the placement's footprint.
    expect(corners.map((corner) => [Math.round(corner.x), Math.round(corner.z)])).toEqual([
      [64, 32 + 30],
      [64 + 44, 32],
    ]);
    expect(world.drawCalls).toBe(1);
    world.dispose();
  });

  it('draws nothing, over no chunks, for an empty plot', () => {
    const world = build([model('hut', 2)], []);
    expect(world.drawCalls).toBe(0);
    expect(world.chunkCount).toBe(0);
    expect(world.instanceCount).toBe(0);
    expect(world.drawnTriangleCount).toBe(0);
    // No hut stands, so its geometry is not counted as uploaded either.
    expect(world.uniqueTriangleCount).toBe(0);
    world.dispose();
  });

  it('makes one mesh per model and chunk, and counts what it drew', () => {
    const world = build(
      [model('hut', 2), model('lamp', 3, true)],
      [at('a', 'hut', 0), at('b', 'hut', 150), at('c', 'lamp', 10)],
    );
    // hut in two chunks, lamp in one — and the lamp's glow is a mesh of its own.
    expect(world.drawCalls).toBe(4);
    expect(world.chunkCount).toBe(2);
    expect(world.instanceCount).toBe(3);
    expect(world.uniqueTriangleCount).toBe(5);
    expect(world.unmergedTriangleCount).toBe(10);
    expect(world.drawnTriangleCount).toBe(2 + 2 + 3 + 1);
    world.dispose();
  });

  it("keeps a bucket's live count at what it draws, and its buffer larger", () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0), at('b', 'hut', 10)]);
    const mesh = meshNamed(world, 'hut@0,0')!;
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.count).toBeGreaterThan(2);
    world.dispose();
  });

  it('stands a new object in the chunk it falls in', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    world.add(at('b', 'hut', 20, 30));
    expect(world.instanceCount).toBe(2);
    expect(world.drawnTriangleCount).toBe(4);
    expect(positionsOf(meshNamed(world, 'hut@0,0')!)).toEqual([
      { x: 0, z: 0 },
      { x: 20, z: 30 },
    ]);
    world.dispose();
  });

  it('opens a mesh for a chunk only once something lands in it', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    expect(meshNamed(world, 'hut@1,0')).toBeUndefined();
    world.add(at('b', 'hut', 150));
    expect(meshNamed(world, 'hut@1,0')?.count).toBe(1);
    expect(world.drawCalls).toBe(2);
    expect(world.chunkCount).toBe(2);
    world.dispose();
  });

  it('grows one bucket past its capacity without losing what it held', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    const before = meshNamed(world, 'hut@0,0')!;
    const capacity = before.instanceMatrix.count;
    for (let index = 0; index <= capacity; index++) world.add(at(`n${index}`, 'hut', index));

    const after = meshNamed(world, 'hut@0,0')!;
    expect(after).not.toBe(before);
    expect(after.instanceMatrix.count).toBeGreaterThan(capacity);
    expect(after.count).toBe(capacity + 2);
    expect(positionsOf(after).map((position) => position.x)).toEqual([
      0,
      ...Array.from({ length: capacity + 1 }, (_, index) => index),
    ]);
    // Still one mesh in the group: the old one was taken out, not left behind.
    expect(world.drawCalls).toBe(1);
    expect(world.group.children).toHaveLength(1);
    world.dispose();
  });

  it('refuses to stand two objects under one key', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    expect(() => world.add(at('a', 'hut', 50))).toThrow(/already stands/);
    world.dispose();
  });

  it('refuses an object nothing was meshed for', () => {
    const world = build([model('hut', 2)], []);
    expect(() => world.add(at('a', 'shed', 0))).toThrow(/No geometry was meshed/);
    world.dispose();
  });

  it('fills the hole a removal leaves with the last instance', () => {
    const world = build(
      [model('hut', 2)],
      [at('a', 'hut', 0), at('b', 'hut', 10), at('c', 'hut', 20)],
    );
    expect(world.remove('a')).toBe(true);
    expect(world.instanceCount).toBe(2);
    expect(world.drawnTriangleCount).toBe(4);
    const mesh = meshNamed(world, 'hut@0,0')!;
    expect(mesh.count).toBe(2);
    expect(
      positionsOf(mesh)
        .map((position) => position.x)
        .toSorted(),
    ).toEqual([10, 20]);
    world.dispose();
  });

  it("takes a chunk's mesh away once nothing stands in it", () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0), at('b', 'hut', 150)]);
    world.remove('b');
    expect(meshNamed(world, 'hut@1,0')).toBeUndefined();
    expect(world.drawCalls).toBe(1);
    expect(world.chunkCount).toBe(1);
    expect(world.uniqueTriangleCount).toBe(2);
    world.dispose();
  });

  it('removes both halves of a glowing model', () => {
    const world = build([model('lamp', 3, true)], [at('a', 'lamp', 0)]);
    expect(world.drawCalls).toBe(2);
    expect(world.remove('a')).toBe(true);
    expect(world.drawCalls).toBe(0);
    expect(world.drawnTriangleCount).toBe(0);
    world.dispose();
  });

  it('says so when there was nothing to remove', () => {
    const world = build([model('hut', 2)], []);
    expect(world.remove('nobody')).toBe(false);
    world.dispose();
  });

  it('keeps the bounding sphere over what a bucket actually holds', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    const near = meshNamed(world, 'hut@0,0')!.boundingSphere!.radius;
    world.add(at('b', 'hut', 90));
    expect(meshNamed(world, 'hut@0,0')!.boundingSphere!.radius).toBeGreaterThan(near);
    world.remove('b');
    expect(meshNamed(world, 'hut@0,0')!.boundingSphere!.radius).toBeCloseTo(near);
    world.dispose();
  });

  it('reconciles a whole set of placements, touching only what differs', () => {
    const world = build(
      [model('hut', 2)],
      [at('a', 'hut', 0), at('b', 'hut', 10), at('c', 'hut', 150)],
    );
    const untouched = meshNamed(world, 'hut@0,0')!;
    world.setPlacements([at('a', 'hut', 0), at('b', 'hut', 10), at('d', 'hut', 20)]);
    expect(world.instanceCount).toBe(3);
    // The chunk that lost its only instance is gone; the other kept its mesh.
    expect(meshNamed(world, 'hut@1,0')).toBeUndefined();
    expect(meshNamed(world, 'hut@0,0')).toBe(untouched);
    expect(
      positionsOf(untouched)
        .map((position) => position.x)
        .toSorted(),
    ).toEqual([0, 10, 20]);
    world.dispose();
  });

  it('moves an object that kept its key but changed place', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    world.setPlacements([at('a', 'hut', 150)]);
    expect(world.instanceCount).toBe(1);
    expect(meshNamed(world, 'hut@0,0')).toBeUndefined();
    expect(positionsOf(meshNamed(world, 'hut@1,0')!)).toEqual([{ x: 150, z: 0 }]);
    world.dispose();
  });

  it('empties the scene when it is reconciled against nothing', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0), at('b', 'hut', 150)]);
    world.setPlacements([]);
    expect(world.drawCalls).toBe(0);
    expect(world.chunkCount).toBe(0);
    expect(world.instanceCount).toBe(0);
    expect(world.drawnTriangleCount).toBe(0);
    expect(world.group.children).toHaveLength(0);
    world.dispose();
  });

  it('empties the group on dispose', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    world.dispose();
    expect(world.group.children).toHaveLength(0);
  });
});
