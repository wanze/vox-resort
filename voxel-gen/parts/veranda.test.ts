import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { arcade, balustrade } from './veranda.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

/** The inclusive span a layer covers on one axis, or null if it is empty. */
const span = (b: VoxelBuilder, y: number, axis: 'x' | 'z'): [number, number] | null => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const key of b.voxels.keys()) {
    const [x, layer, z] = key.split(',').map(Number) as [number, number, number];
    if (layer !== y) continue;
    const value = axis === 'x' ? x : z;
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  return lo === Infinity ? null : [lo, hi];
};

/** Which columns of a layer are clear along the run, as `.` and `#`. */
const columns = (b: VoxelBuilder, y: number, from: number, to: number, z: number): string => {
  let row = '';
  for (let x = from; x <= to; x++) row += at(b, x, y, z) === undefined ? '.' : '#';
  return row;
};

/** Three bays of five, on piers of three: the villa's veranda. */
const veranda = (b: VoxelBuilder): number =>
  arcade(b, { x: 0, z: 0, w: 27, d: 2, y: 0, along: 'x', bays: 3, pier: 3, height: 6 });

describe('arcade', () => {
  it('leaves every pier the width it was asked for, remainder and all', () => {
    const b = new VoxelBuilder();
    // 26 does not divide by three, so the bays absorb the odd voxel: a bay a
    // voxel wider than its neighbour does not show, a thin pier would.
    arcade(b, { x: 0, z: 0, w: 26, d: 2, y: 0, along: 'x', bays: 3, pier: 3, height: 6 });
    expect(columns(b, 0, 0, 25, 0)).toBe('###.....###....###.....###');
  });

  it('carves each bay clear through the depth of the run', () => {
    const b = new VoxelBuilder();
    veranda(b);
    expect(columns(b, 0, 0, 26, 0)).toBe('###.....###.....###.....###');
    expect(columns(b, 0, 0, 26, 1)).toBe('###.....###.....###.....###');
    expect(columns(b, 5, 0, 26, 0)).toBe('###.....###.....###.....###');
  });

  it('narrows the arch head as it rises, and closes it under a solid crown', () => {
    const b = new VoxelBuilder();
    const free = veranda(b);
    // Five clear, then three, then the course the cornice sits on.
    expect(columns(b, 6, 0, 26, 0)).toBe('###.....###.....###.....###');
    expect(columns(b, 7, 0, 26, 0)).toBe('####...#####...#####...####');
    expect(columns(b, 8, 0, 26, 0)).toBe('###########################');
    expect(at(b, 5, 8, 0)).toBe(PALETTE.stucco.base);
    expect(free).toBe(10);
  });

  it('lays a skirting and an impost band that only the piers keep', () => {
    const b = new VoxelBuilder();
    veranda(b);
    expect(at(b, 1, 0, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 1, 1, 0)).toBe(PALETTE.stone.base);
    expect(at(b, 1, 2, 0)).toBe(PALETTE.stucco.base);
    expect(at(b, 1, 5, 0)).toBe(PALETTE.stone.light);
    // The bays take both bands away with them.
    expect(at(b, 5, 0, 0)).toBeUndefined();
    expect(at(b, 5, 5, 0)).toBeUndefined();
  });

  it('caps the run with a cornice, and says where the veranda roof goes', () => {
    const b = new VoxelBuilder();
    const free = veranda(b);
    expect(at(b, 5, 9, 0)).toBe(PALETTE.stucco.light);
    expect(span(b, 9, 'x')).toEqual([0, 26]);
    expect(at(b, 5, 10, 0)).toBeUndefined();
    expect(free).toBe(10);
  });

  it('runs along whichever axis it is given', () => {
    const b = new VoxelBuilder();
    arcade(b, { x: 0, z: 0, w: 2, d: 27, y: 0, along: 'z', bays: 3, pier: 3, height: 6 });
    for (const x of [0, 1]) {
      let row = '';
      for (let z = 0; z <= 26; z++) row += at(b, x, 0, z) === undefined ? '.' : '#';
      expect(row, `x ${x}`).toBe('###.....###.....###.....###');
    }
  });

  it('puts a bay on the centre line when it is given an odd count', () => {
    const b = new VoxelBuilder();
    veranda(b);
    // 27 long: the middle bay is columns 11..15, centred on 13.
    expect(at(b, 13, 0, 0)).toBeUndefined();
    expect(at(b, 13, 8, 0)).toBe(PALETTE.stucco.base);
  });

  it('paints the materials it is handed', () => {
    const b = new VoxelBuilder();
    arcade(b, {
      x: 0,
      z: 0,
      w: 27,
      d: 2,
      y: 0,
      along: 'x',
      bays: 3,
      pier: 3,
      height: 6,
      wall: PALETTE.slate,
      trim: PALETTE.teak,
    });
    expect(at(b, 1, 3, 0)).toBe(PALETTE.slate.base);
    expect(at(b, 1, 0, 0)).toBe(PALETTE.teak.base);
    expect(at(b, 1, 5, 0)).toBe(PALETTE.teak.light);
  });

  it('refuses a run with no room for the bays it is asked for', () => {
    const options = { x: 0, z: 0, w: 12, d: 2, y: 0, along: 'x', bays: 4, pier: 3 } as const;
    expect(() => arcade(new VoxelBuilder(), options)).toThrow(/no room for 4 bays/);
    expect(() => arcade(new VoxelBuilder(), { ...options, bays: 0 })).toThrow(/one bay/);
    expect(() => arcade(new VoxelBuilder(), { ...options, bays: 1, pier: 0 })).toThrow(/one voxel/);
    expect(() => arcade(new VoxelBuilder(), { ...options, bays: 1, height: 0 })).toThrow(
      /one clear layer/,
    );
  });
});

describe('balustrade', () => {
  it('leaves real gaps between the balusters, rather than painting them on', () => {
    const b = new VoxelBuilder();
    balustrade(b, { x: 0, z: 0, y: 0, w: 9, along: 'x' });
    expect(columns(b, 1, 0, 8, 0)).toBe('#.#.#.#.#');
    expect(columns(b, 2, 0, 8, 0)).toBe('#.#.#.#.#');
    expect(at(b, 0, 1, 0)).toBe(PALETTE.stone.base);
  });

  it('closes the run under a bottom rail and over a coping', () => {
    const b = new VoxelBuilder();
    balustrade(b, { x: 0, z: 0, y: 4, w: 9, along: 'x' });
    expect(columns(b, 4, 0, 8, 0)).toBe('#########');
    expect(columns(b, 7, 0, 8, 0)).toBe('#########');
    expect(at(b, 3, 4, 0)).toBe(PALETTE.stone.shade);
    expect(at(b, 3, 7, 0)).toBe(PALETTE.stone.light);
    expect(at(b, 3, 8, 0)).toBeUndefined();
  });

  it('finishes with a post at each end, whatever the pitch works out to', () => {
    const b = new VoxelBuilder();
    balustrade(b, { x: 0, z: 0, y: 0, w: 8, along: 'x', pitch: 3 });
    expect(columns(b, 1, 0, 7, 0)).toBe('#..#..##');
  });

  it('runs along whichever axis it is given, as deep as it is asked for', () => {
    const b = new VoxelBuilder();
    balustrade(b, { x: 0, z: 0, y: 0, w: 5, along: 'z', depth: 2 });
    for (const x of [0, 1]) {
      let row = '';
      for (let z = 0; z <= 4; z++) row += at(b, x, 1, z) === undefined ? '.' : '#';
      expect(row, `x ${x}`).toBe('#.#.#');
    }
    expect(at(b, 2, 1, 0)).toBeUndefined();
  });

  it('is turned from the material it is handed, stone or teak', () => {
    const b = new VoxelBuilder();
    balustrade(b, { x: 0, z: 0, y: 0, w: 5, along: 'x', rail: PALETTE.teak });
    expect(at(b, 0, 0, 0)).toBe(PALETTE.teak.shade);
    expect(at(b, 0, 1, 0)).toBe(PALETTE.teak.base);
    expect(at(b, 0, 3, 0)).toBe(PALETTE.teak.light);
  });

  it('refuses a run with nothing to see through', () => {
    const options = { x: 0, z: 0, y: 0, w: 5, along: 'x' } as const;
    expect(() => balustrade(new VoxelBuilder(), { ...options, w: 0 })).toThrow(/one voxel long/);
    expect(() => balustrade(new VoxelBuilder(), { ...options, depth: 0 })).toThrow(
      /one voxel deep/,
    );
    expect(() => balustrade(new VoxelBuilder(), { ...options, height: 2 })).toThrow(/three layers/);
    expect(() => balustrade(new VoxelBuilder(), { ...options, pitch: 0 })).toThrow(/a voxel apart/);
  });
});
