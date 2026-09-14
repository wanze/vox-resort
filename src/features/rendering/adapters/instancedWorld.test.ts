import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Vector3,
  type InstancedBufferGeometry,
  type InterleavedBufferAttribute,
  type Mesh,
} from 'three/webgpu';
import type { Placement } from '../../layout/domain/resortLayout';
import { orthographicLens, perspectiveLens } from '../domain/levelOfDetail';
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
    water: null,
    window: null,
    triangleCount: triangles,
    unmergedTriangleCount: triangles * 2,
  };
}

/** A model with water in it, which is a third geometry and a third material. */
function wetModel(id: string, triangles: number): ModelGeometry {
  return {
    id,
    lit: geometryOf(triangles),
    emissive: null,
    water: geometryOf(2),
    window: null,
    triangleCount: triangles + 2,
    unmergedTriangleCount: (triangles + 2) * 2,
  };
}

/** A chunk small enough that a test can put two placements either side of it. */
const CHUNK = 100;

const build = (models: readonly ModelGeometry[], placements: readonly Placement[]) =>
  buildInstancedWorld(models, placements, { chunkVoxels: CHUNK });

const meshNamed = (world: { group: { children: readonly unknown[] } }, name: string) =>
  world.group.children.find((child) => (child as Mesh).name === name) as Mesh | undefined;

const instancesOf = (mesh: Mesh): InstancedBufferGeometry =>
  mesh.geometry as InstancedBufferGeometry;

/** Instances a bucket draws. */
const countOf = (mesh: Mesh): number => instancesOf(mesh).instanceCount;

/** Instances a bucket's buffer has room for. */
const capacityOf = (mesh: Mesh): number =>
  (instancesOf(mesh).getAttribute('instanceColumn0') as InterleavedBufferAttribute).data.count;

/** The matrix written into one slot of a bucket. */
function matrixAt(mesh: Mesh, slot: number): Matrix4 {
  const column = instancesOf(mesh).getAttribute('instanceColumn0') as InterleavedBufferAttribute;
  return new Matrix4().fromArray(column.data.array, slot * 16);
}

/** Where each live instance of a mesh stands, in the order its slots hold them. */
function positionsOf(mesh: Mesh): { x: number; z: number }[] {
  return Array.from({ length: countOf(mesh) }, (_, slot) => {
    const matrix = matrixAt(mesh, slot);
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
    const matrix = matrixAt(meshNamed(world, 'hut@0,0')!, 0);

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
    expect(countOf(mesh)).toBe(2);
    expect(capacityOf(mesh)).toBeGreaterThan(2);
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
    expect(countOf(meshNamed(world, 'hut@1,0')!)).toBe(1);
    expect(world.drawCalls).toBe(2);
    expect(world.chunkCount).toBe(2);
    world.dispose();
  });

  it('grows one bucket past its capacity without losing what it held', () => {
    const world = build([model('hut', 2)], [at('a', 'hut', 0)]);
    const before = meshNamed(world, 'hut@0,0')!;
    const capacity = capacityOf(before);
    for (let index = 0; index <= capacity; index++) world.add(at(`n${index}`, 'hut', index));

    const after = meshNamed(world, 'hut@0,0')!;
    expect(after).not.toBe(before);
    expect(capacityOf(after)).toBeGreaterThan(capacity);
    expect(countOf(after)).toBe(capacity + 2);
    expect(positionsOf(after).map((position) => position.x)).toEqual([
      0,
      ...Array.from({ length: capacity + 1 }, (_, index) => index),
    ]);
    // Still one mesh a layer in the group: the old one was taken out, not left
    // behind. The other three are the region, far region and district the same
    // hut is drawn in.
    expect(world.drawCalls).toBe(1);
    expect(world.group.children).toHaveLength(4);
    world.dispose();
  });

  it('lets every bucket of a material share one shader', () => {
    // Three.js's WebGPU renderer keys an `InstancedMesh`'s built shader on the
    // mesh's own uuid, so fifteen thousand of them were fifteen thousand node
    // builds, paid the first frame each was drawn. A plain mesh over an
    // instanced geometry is keyed on its material and attribute layout alone.
    const world = build(
      [model('hut', 2), model('lamp', 3, true)],
      [at('a', 'hut', 0), at('b', 'hut', 150), at('c', 'lamp', 10)],
    );
    for (const child of world.group.children) {
      const mesh = child as Mesh & { isInstancedMesh?: boolean; count?: number };
      expect(mesh.isInstancedMesh, mesh.name).toBeUndefined();
      expect(mesh.count ?? 1, mesh.name).toBeLessThanOrEqual(1);
      expect((mesh.geometry as InstancedBufferGeometry).isInstancedBufferGeometry).toBe(true);
    }
    // And the catalogue's attributes are shared, not copied per bucket.
    const [first, second] = ['hut@0,0', 'hut@1,0'].map((name) => meshNamed(world, name)!);
    expect(first!.geometry.getAttribute('position')).toBe(
      second!.geometry.getAttribute('position'),
    );
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
    expect(countOf(mesh)).toBe(2);
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

  it('draws a model with water in it as a mesh of its own', () => {
    const world = build([wetModel('pool', 4)], [at('a', 'pool', 0)]);
    expect(world.drawCalls).toBe(2);
    expect(world.drawnTriangleCount).toBe(6);
    // The two meshes share a name and differ in material, which is what the
    // bucket key is for; both go when the pool does.
    expect(world.remove('a')).toBe(true);
    expect(world.drawCalls).toBe(0);
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
    const radius = (): number => meshNamed(world, 'hut@0,0')!.geometry.boundingSphere!.radius;
    const near = radius();
    world.add(at('b', 'hut', 90));
    expect(radius()).toBeGreaterThan(near);
    world.remove('b');
    expect(radius()).toBeCloseTo(near);
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

  it('leaves the geometries it was handed alone, because the catalogue owns them', () => {
    const models = [model('hut', 2), model('lamp', 3, true), wetModel('pool', 4)];
    const disposed = countDisposals(models);
    const world = build(models, [at('a', 'hut', 0), at('b', 'lamp', 10), at('c', 'pool', 20)]);
    world.dispose();
    expect(disposed()).toBe(0);
  });

  it('keeps the geometries for the world that replaces it', () => {
    // A regenerate builds the new world over the same catalogue before the old
    // one is let go, so the old one's dispose must not reach the new one's meshes.
    const models = [model('hut', 2), model('lamp', 3, true)];
    const disposed = countDisposals(models);
    const previous = build(models, [at('a', 'hut', 0)]);
    const next = build(models, [at('a', 'hut', 0), at('b', 'lamp', 10)]);
    previous.dispose();
    expect(disposed()).toBe(0);
    expect(next.drawCalls).toBe(3);
    next.dispose();
    expect(disposed()).toBe(0);
  });
});

/** A model `size` voxels across, so the level of detail has something to judge. */
function sizedModel(id: string, size: number, coarse: boolean): ModelGeometry {
  const sized = (triangles: number): BufferGeometry => {
    const geometry = geometryOf(triangles);
    geometry.scale(size / 2, 1, 1);
    return geometry;
  };
  return {
    ...model(id, 8),
    lit: sized(8),
    coarse: coarse ? { ...model(`${id}~coarse`, 2), lit: sized(2) } : null,
  };
}

/** Everything drawn at half a pixel per voxel, wherever it stands: far, and not small. */
const FAR = { x: 0, y: 0, z: 0, lens: orthographicLens(1, 2) };
/** Everything drawn at two pixels per voxel: close, but not close enough to chunk. */
const MID = { x: 0, y: 0, z: 0, lens: orthographicLens(4, 2) };
/** Everything drawn at eight pixels per voxel: near enough to draw a chunk at a time. */
const NEAR = { x: 0, y: 0, z: 0, lens: orthographicLens(16, 2) };
/** Everything drawn at a hundredth of a pixel per voxel: too small to see. */
const SPECK = { x: 0, y: 0, z: 0, lens: orthographicLens(1, 100) };

/** The meshes a pass left visible, by name. */
const visibleNames = (world: { group: { children: readonly Mesh[] } }): string[] =>
  world.group.children
    .filter((child) => child.visible)
    .map((child) => child.name)
    .toSorted();

describe('level of detail', () => {
  it('draws each part of the plot at the level its distance calls for', () => {
    // Chunks are 100 voxels, regions 400 and districts 1 600. The camera stands
    // in region 7, a hundred pixels a voxel falling off with distance: region 7
    // is chunked, region 8 next door is whole, region 4 across the district is
    // coarse, and district 0 beyond it is one coarse draw altogether.
    const world = build(
      [sizedModel('hut', 64, true)],
      [at('a', 'hut', 0), at('b', 'hut', 1700), at('c', 'hut', 3300), at('d', 'hut', 3000)],
    );
    world.updateDetail({ x: 3050, y: 0, z: 50, lens: perspectiveLens(200, 90) });
    expect(visibleNames(world as never)).toEqual([
      'hut@0,0~district',
      'hut@30,0',
      'hut@4,0~far',
      'hut@8,0~mid',
    ]);
    expect(world.detailCounts).toEqual({ near: 1, mid: 1, far: 1, district: 1, hidden: 0 });
    world.dispose();
  });

  it('draws a far district as one coarse draw per model, whatever regions it spans', () => {
    // Two regions of the far layer, one district.
    const models = [sizedModel('hut', 64, true)];
    const world = build(models, [at('a', 'hut', 0), at('b', 'hut', 500)]);
    world.updateDetail(FAR);
    const whole = meshNamed(world, 'hut@0,0~district')!;
    expect(countOf(whole)).toBe(2);
    expect(drawsGeometry(whole, models[0]!.coarse!.lit!)).toBe(true);
    expect(visibleNames(world as never)).toEqual(['hut@0,0~district']);
    expect(world.detailCounts).toEqual({ near: 0, mid: 0, far: 0, district: 1, hidden: 0 });
    world.dispose();
  });

  it('draws a region whole and in full a step out from the chunks', () => {
    const models = [sizedModel('hut', 64, true)];
    const world = build(models, [at('a', 'hut', 0), at('b', 'hut', 150)]);
    world.updateDetail(MID);
    const whole = meshNamed(world, 'hut@0,0~mid')!;
    expect(countOf(whole)).toBe(2);
    expect(drawsGeometry(whole, models[0]!.lit!)).toBe(true);
    expect(visibleNames(world as never)).toEqual(['hut@0,0~mid']);
    world.dispose();
  });

  it('comes back to the full chunks near to, and with no view at all', () => {
    const world = build([sizedModel('hut', 64, true)], [at('a', 'hut', 0), at('b', 'hut', 150)]);
    world.updateDetail(FAR);
    world.updateDetail(NEAR);
    expect(visibleNames(world as never)).toEqual(['hut@0,0', 'hut@1,0']);
    world.updateDetail(FAR);
    world.updateDetail(null);
    expect(world.detailCounts).toEqual({ near: 2, mid: 0, far: 0, district: 0, hidden: 0 });
    expect(visibleNames(world as never)).toEqual(['hut@0,0', 'hut@1,0']);
    world.dispose();
  });

  it('hides what is too small to see, whichever layer would draw it', () => {
    const world = build([sizedModel('hut', 64, true)], [at('a', 'hut', 0)]);
    world.updateDetail(SPECK);
    expect(visibleNames(world as never)).toEqual([]);
    expect(world.detailCounts.hidden).toBe(1);
    world.dispose();
  });

  it('draws a model with no coarse copy far away with its own geometry', () => {
    const models = [sizedModel('hut', 64, false)];
    const world = build(models, [at('a', 'hut', 0)]);
    world.updateDetail(FAR);
    const whole = meshNamed(world, 'hut@0,0~district')!;
    expect(whole.visible).toBe(true);
    expect(drawsGeometry(whole, models[0]!.lit!)).toBe(true);
    world.dispose();
  });

  it('draws nothing far away for a surface the coarse copy lost', () => {
    // A lamp whose glow the coarse copy painted over: its glass is not drawn
    // from that far, rather than drawn in full beside a coarse post.
    const lamp = { ...sizedModel('lamp', 64, true), emissive: geometryOf(1) };
    const world = build([lamp], [at('a', 'lamp', 0)]);
    world.updateDetail(FAR);
    expect(drawsGeometry(meshNamed(world, 'lamp@0,0~district')!, lamp.coarse!.lit!)).toBe(true);
    expect(world.group.children.filter((child) => child.visible)).toHaveLength(1);
    world.dispose();
  });

  it('keeps every layer current as objects are added and removed', () => {
    const world = build([sizedModel('hut', 64, true)], [at('a', 'hut', 0)]);
    world.updateDetail(FAR);
    for (let index = 0; index < 10; index++) world.add(at(`n${index}`, 'hut', index * 30));
    world.updateDetail(FAR);
    for (const name of ['hut@0,0~mid', 'hut@0,0~far', 'hut@0,0~district']) {
      expect(countOf(meshNamed(world, name)!), name).toBe(11);
    }
    expect(meshNamed(world, 'hut@0,0~district')!.visible).toBe(true);
    world.remove('n3');
    expect(countOf(meshNamed(world, 'hut@0,0~district')!)).toBe(10);
    world.dispose();
  });

  it('takes every layer’s mesh away with the last object in it', () => {
    const world = build([sizedModel('hut', 64, true)], [at('a', 'hut', 0)]);
    world.remove('a');
    expect(world.group.children).toHaveLength(0);
    world.dispose();
  });
});

/** Whether a bucket draws this catalogue geometry: shares its index and positions. */
const drawsGeometry = (mesh: Mesh, geometry: BufferGeometry): boolean =>
  mesh.geometry.getIndex() === geometry.getIndex() &&
  mesh.geometry.getAttribute('position') === geometry.getAttribute('position');

/** Counts `dispose` events on every geometry of `models`, read through the returned function. */
function countDisposals(models: readonly ModelGeometry[]): () => number {
  let disposed = 0;
  for (const entry of models) {
    for (const geometry of [entry.lit, entry.emissive, entry.water, entry.window]) {
      geometry?.addEventListener('dispose', () => {
        disposed++;
      });
    }
  }
  return () => disposed;
}
