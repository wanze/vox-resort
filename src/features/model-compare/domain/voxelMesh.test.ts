import { describe, expect, it } from 'vitest';
import { buildModel, defineModel } from '../../../../voxel-gen/voxelgen.ts';
import { meshVoxelModel } from './voxelMesh';

const slab = buildModel(
  defineModel({
    id: 'slab',
    label: 'Slab',
    category: 'grounds',
    tiles: { x: 1, z: 1 },
    emissive: [0xffcc00],
    water: [0x3399ff],
    build: (b) => {
      b.box(0, 3, 0, 0, 0, 3, 0x808080);
      b.set(0, 1, 0, 0xffcc00);
      b.set(3, 1, 3, 0x3399ff);
    },
  }),
);

describe('meshVoxelModel', () => {
  it('merges each flat single-colour face into one quad', () => {
    const cube = buildModel(
      defineModel({
        id: 'cube',
        label: 'Cube',
        category: 'grounds',
        tiles: { x: 1, z: 1 },
        build: (b) => b.box(0, 3, 0, 3, 0, 3, 0x808080),
      }),
    );
    expect(meshVoxelModel(cube).triangleCount).toBe(12);
  });

  it('splits a face where the colour changes', () => {
    const striped = buildModel(
      defineModel({
        id: 'striped',
        label: 'Striped',
        category: 'grounds',
        tiles: { x: 1, z: 1 },
        build: (b) => {
          b.box(0, 1, 0, 0, 0, 0, 0x808080);
          b.box(2, 3, 0, 0, 0, 0, 0x404040);
        },
      }),
    );
    // Two boxes of 1x2: each keeps five outer faces, the shared one is hidden.
    expect(meshVoxelModel(striped).triangleCount).toBe(20);
  });

  it('sorts faces into lit, glowing and water surfaces by the colours the model declares', () => {
    const { surfaces } = meshVoxelModel(slab);
    expect(surfaces.emissive?.indices.length).toBe(5 * 6);
    expect(surfaces.water?.indices.length).toBe(5 * 6);
    expect(surfaces.lit).not.toBeNull();
  });

  it('keeps one colour, normal and position per vertex', () => {
    const lit = meshVoxelModel(slab).surfaces.lit!;
    expect(lit.colors.length).toBe(lit.positions.length);
    expect(lit.normals.length).toBe(lit.positions.length);
    expect(Math.max(...lit.indices)).toBeLessThan(lit.positions.length / 3);
  });
});
