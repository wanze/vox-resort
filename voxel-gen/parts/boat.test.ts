import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { hull, pedalo, PEDALO_BEAM, PEDALO_LENGTH, PEDALO_PAIR_BEAM, pedaloSeats } from './boat.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

const layer = (b: VoxelBuilder, y: number): Set<string> => {
  const cells = new Set<string>();
  for (const key of b.voxels.keys()) {
    const [x, cellY, z] = key.split(',').map(Number) as [number, number, number];
    if (cellY === y) cells.add(`${x},${z}`);
  }
  return cells;
};

describe('hull', () => {
  it('builds an open boat: a wet bottom, a floor, two sides and a gunwale', () => {
    const b = new VoxelBuilder();
    expect(hull(b, { x: 0, z: 0, y: 0, length: 16, beam: 3 })).toBe(4);
    expect(at(b, 0, 0, 8)).toBe(PALETTE.teak.deep);
    expect(at(b, 0, 1, 8)).toBe(PALETTE.teak.shade);
    expect(at(b, 0, 2, 8)).toBeUndefined();
    expect(at(b, 3, 2, 8)).toBe(PALETTE.teak.base);
    expect(at(b, 3, 3, 8)).toBe(PALETTE.teak.light);
    expect(at(b, 4, 1, 8)).toBeUndefined();
  });

  it('closes the transom and the stem across their whole width', () => {
    const b = new VoxelBuilder();
    hull(b, { x: 0, z: 0, y: 0, length: 16, beam: 3 });
    expect(at(b, 0, 2, 0)).toBe(PALETTE.teak.base);
    expect(at(b, 0, 2, 15)).toBe(PALETTE.teak.base);
  });

  it('narrows towards the bow and holds its beam amidships', () => {
    const b = new VoxelBuilder();
    hull(b, { x: 0, z: 0, y: 0, length: 16, beam: 3 });
    const widthAt = (z: number): number =>
      [...layer(b, 0)].filter((cell) => Number(cell.split(',')[1]) === z).length;
    expect(widthAt(8)).toBeGreaterThan(widthAt(15));
    expect(widthAt(6)).toBe(widthAt(8));
  });

  it('takes the timber it is given, and refuses a boat too small to be one', () => {
    const b = new VoxelBuilder();
    hull(b, { x: 0, z: 0, y: 0, length: 8, beam: 2, timber: PALETTE.stucco });
    expect(at(b, 0, 0, 4)).toBe(PALETTE.stucco.deep);
    expect(() => hull(new VoxelBuilder(), { x: 0, z: 0, y: 0, length: 3, beam: 2 })).toThrow(
      /four voxels long/,
    );
    expect(() => hull(new VoxelBuilder(), { x: 0, z: 0, y: 0, length: 8, beam: 0 })).toThrow(
      /one voxel of beam/,
    );
  });
});

describe('pedalo', () => {
  it('floats two hulls with a footwell between them', () => {
    const b = new VoxelBuilder();
    pedalo(b, { x: 0, z: 0, y: 0 });
    for (const side of [-1, 1]) {
      expect(at(b, side * PEDALO_BEAM, 2, 4)).toBe(PALETTE.stucco.light);
    }
    expect(at(b, 0, 1, 5)).toBe(PALETTE.stucco.light);
    expect(at(b, 0, 2, 5)).toBeUndefined();
  });

  it('stands two seats in the well, in the trim it is given', () => {
    const b = new VoxelBuilder();
    pedalo(b, { x: 0, z: 0, y: 0, trim: PALETTE.bloom });
    for (const side of [-1, 1]) {
      expect(at(b, side * 2, 2, 5)).toBe(PALETTE.bloom.base);
      expect(at(b, side * 2, 3, 3)).toBe(PALETTE.bloom.shade);
    }
  });

  it('seats two abreast at the pair beam, each figure clear of its float and its neighbour', () => {
    const b = new VoxelBuilder();
    pedalo(b, { x: 0, z: 0, y: 0, beam: PEDALO_PAIR_BEAM });
    const seats = pedaloSeats({ x: 0, y: 0, z: 0 });
    expect(seats).toHaveLength(2);
    const [port, starboard] = seats.map((seat) => seat.x).toSorted((one, other) => one - other);
    expect(starboard! - port!).toBeGreaterThanOrEqual(3);
    // A float's top is stucco light at the gunwale; a figure is three voxels wide.
    for (const seat of seats) {
      for (let x = seat.x - 1; x <= seat.x + 1; x++) {
        expect(at(b, x, 2, seat.z), `figure at ${x}`).not.toBe(PALETTE.stucco.light);
      }
      expect(at(b, seat.x + Math.sign(seat.x) * 2, 2, seat.z)).toBe(PALETTE.stucco.light);
    }
  });

  it('stripes the outside of each float and nothing else', () => {
    const b = new VoxelBuilder();
    pedalo(b, { x: 0, z: 0, y: 0, trim: PALETTE.amber });
    expect(at(b, PEDALO_BEAM, 1, 4)).toBe(PALETTE.amber.base);
    expect(at(b, PEDALO_BEAM - 1, 1, 4)).toBe(PALETTE.stucco.base);
  });

  it('puts a paddle wheel at the stern and a stem at the bow', () => {
    const b = new VoxelBuilder();
    pedalo(b, { x: 0, z: 0, y: 0 });
    expect(at(b, 0, 1, 0)).toBe(PALETTE.slate.shade);
    expect(at(b, PEDALO_BEAM - 1, 1, PEDALO_LENGTH - 1)).toBe(PALETTE.stucco.light);
    expect(at(b, PEDALO_BEAM, 1, PEDALO_LENGTH - 1)).toBeUndefined();
  });
});
