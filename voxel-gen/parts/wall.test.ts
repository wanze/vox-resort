import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { awning, doorway, shutteredWindow, STOREY_VOXELS, stuccoWall } from './wall.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

const wall = (b: VoxelBuilder, storeys = 1): number =>
  stuccoWall(b, { x: 0, z: 0, w: 8, d: 8, y: 3, storeys });

describe('stuccoWall', () => {
  it('paints a solid body, because a cavity costs more than it saves', () => {
    const b = new VoxelBuilder();
    wall(b);
    expect(at(b, 4, 8, 4)).toBe(PALETTE.stucco.base);
    expect(b.voxels.size).toBe(8 * 8 * (STOREY_VOXELS + 1));
  });

  it('lays a stone skirting at the foot of the wall', () => {
    const b = new VoxelBuilder();
    wall(b);
    expect(at(b, 4, 3, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 4, 4, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 4, 5, 0)).toBe(PALETTE.stucco.base);
  });

  it('bands a string course between storeys and a cornice under the eaves', () => {
    const b = new VoxelBuilder();
    const free = wall(b, 2);
    expect(at(b, 4, 3 + STOREY_VOXELS - 1, 0)).toBe(PALETTE.stucco.light);
    expect(at(b, 4, 3 + STOREY_VOXELS, 0)).toBe(PALETTE.stucco.base);
    expect(at(b, 4, free - 1, 0)).toBe(PALETTE.stucco.light);
    expect(free).toBe(3 + 2 * STOREY_VOXELS + 1);
  });

  it('lightens the corners, unless a building wants a plain box', () => {
    const b = new VoxelBuilder();
    wall(b);
    expect(at(b, 0, 8, 0)).toBe(PALETTE.stucco.light);
    expect(at(b, 7, 8, 7)).toBe(PALETTE.stucco.light);
    const plain = new VoxelBuilder();
    stuccoWall(plain, { x: 0, z: 0, w: 8, d: 8, y: 3, storeys: 1, quoins: false });
    expect(at(plain, 0, 8, 0)).toBe(PALETTE.stucco.base);
  });

  it('refuses a wall with no storey or no room for an opening', () => {
    expect(() =>
      stuccoWall(new VoxelBuilder(), { x: 0, z: 0, w: 8, d: 8, y: 0, storeys: 0 }),
    ).toThrow(/one storey/);
    expect(() =>
      stuccoWall(new VoxelBuilder(), { x: 0, z: 0, w: 2, d: 8, y: 0, storeys: 1 }),
    ).toThrow(/3 voxels/);
  });
});

describe('shutteredWindow', () => {
  it('cuts the opening one voxel into the wall, which is where the depth comes from', () => {
    const b = new VoxelBuilder();
    wall(b);
    shutteredWindow(b, { face: 'z+', at: 7, along: 2, y: 6 });
    expect(at(b, 2, 6, 7)).toBeUndefined();
    expect(at(b, 2, 6, 6)).toBe(PALETTE.glass.base);
    expect(at(b, 2, 6, 5)).toBe(PALETTE.stucco.base);
  });

  it('sits the pane under a lintel and over a sill', () => {
    const b = new VoxelBuilder();
    wall(b);
    shutteredWindow(b, { face: 'z+', at: 7, along: 2, y: 6, w: 3, h: 5 });
    expect(at(b, 2, 5, 7)).toBe(PALETTE.stone.light);
    expect(at(b, 2, 11, 7)).toBe(PALETTE.stone.light);
    expect(at(b, 2, 10, 6)).toBe(PALETTE.glass.base);
  });

  it('folds a shutter back either side, or leaves them off', () => {
    const b = new VoxelBuilder();
    wall(b);
    shutteredWindow(b, { face: 'z+', at: 7, along: 2, y: 6, w: 3 });
    expect(at(b, 1, 6, 7)).toBe(PALETTE.teak.base);
    expect(at(b, 5, 6, 7)).toBe(PALETTE.teak.base);
    const bare = new VoxelBuilder();
    wall(bare);
    shutteredWindow(bare, { face: 'z+', at: 7, along: 2, y: 6, shutters: false });
    expect(at(bare, 1, 6, 7)).toBe(PALETTE.stucco.base);
  });

  it('hangs on any of the four faces, cutting inwards from each', () => {
    for (const [face, atFace, glass] of [
      ['z+', 7, { x: 3, y: 6, z: 6 }],
      ['z-', 0, { x: 3, y: 6, z: 1 }],
      ['x+', 7, { x: 6, y: 6, z: 3 }],
      ['x-', 0, { x: 1, y: 6, z: 3 }],
    ] as const) {
      const b = new VoxelBuilder();
      wall(b);
      shutteredWindow(b, { face, at: atFace, along: 3, y: 6, w: 1 });
      expect(at(b, glass.x, glass.y, glass.z), face).toBe(PALETTE.glass.base);
    }
  });
});

describe('doorway', () => {
  it('recesses the leaf and frames it in stone', () => {
    const b = new VoxelBuilder();
    wall(b);
    doorway(b, { face: 'z+', at: 7, along: 2, y: 3, w: 3, h: 9 });
    expect(at(b, 2, 3, 7)).toBeUndefined();
    expect(at(b, 2, 3, 6)).toBe(PALETTE.teak.deep);
    expect(at(b, 1, 3, 7)).toBe(PALETTE.stone.light);
    expect(at(b, 5, 11, 7)).toBe(PALETTE.stone.light);
    expect(at(b, 2, 12, 7)).toBe(PALETTE.stone.light);
  });
});

describe('awning', () => {
  it('cantilevers a flat canopy clear of the wall it hangs on', () => {
    const b = new VoxelBuilder();
    wall(b);
    awning(b, { face: 'z+', at: 7, along: 2, w: 3, y: 9, reach: 4, drop: 2 });
    expect(at(b, 2, 9, 7)).toBe(PALETTE.stucco.base);
    for (let out = 1; out <= 4; out++) expect(at(b, 2, 9, 7 + out)).toBe(PALETTE.bloom.base);
    expect(at(b, 2, 9, 12)).toBeUndefined();
  });

  it('hangs a valance at the brink, which is what makes a plane read as canvas', () => {
    const b = new VoxelBuilder();
    awning(b, { face: 'z+', at: 7, along: 2, w: 3, y: 9, reach: 4, drop: 2 });
    expect(at(b, 3, 8, 11)).toBe(PALETTE.bloom.shade);
    expect(at(b, 3, 7, 11)).toBe(PALETTE.bloom.shade);
    expect(at(b, 3, 6, 11)).toBeUndefined();
    expect(at(b, 3, 8, 10)).toBeUndefined();
  });

  it('hangs on any of the four faces, standing out from each', () => {
    for (const [face, atFace, brink] of [
      ['z+', 7, { x: 3, y: 6, z: 9 }],
      ['z-', 0, { x: 3, y: 6, z: -2 }],
      ['x+', 7, { x: 9, y: 6, z: 3 }],
      ['x-', 0, { x: -2, y: 6, z: 3 }],
    ] as const) {
      const b = new VoxelBuilder();
      awning(b, { face, at: atFace, along: 3, w: 1, y: 6, reach: 2 });
      expect(at(b, brink.x, brink.y, brink.z), face).toBe(PALETTE.bloom.base);
    }
  });

  it('refuses a blind with no length or no reach', () => {
    expect(() => awning(new VoxelBuilder(), { face: 'z+', at: 7, along: 2, w: 0, y: 9 })).toThrow(
      /one voxel long/,
    );
    expect(() =>
      awning(new VoxelBuilder(), { face: 'z+', at: 7, along: 2, w: 3, y: 9, reach: 0 }),
    ).toThrow(/one voxel past/);
  });
});
