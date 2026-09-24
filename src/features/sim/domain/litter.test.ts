import { describe, expect, it } from 'vitest';
import {
  binCoverFor,
  CARRY_NODES,
  createCarrying,
  createLitter,
  litterAt,
  litterSummary,
  mostLittered,
  PIECE,
  pickUp,
  pruneLitter,
  stepWith,
  sweep,
  SWEEP_ABOVE,
} from './litter';

const nowhere = (tiles: number): Uint8Array => new Uint8Array(tiles);

describe('pickUp', () => {
  it('hands the guest something to throw away when the draw falls below the chance', () => {
    const carrying = createCarrying(2);
    pickUp(carrying, 0, 0.5, 0.49);
    expect(carrying.nodes[0]).toBe(CARRY_NODES);
    expect(carrying.nodes[1]).toBe(0);
  });

  it('leaves the guest empty-handed when the draw is at or above the chance', () => {
    const carrying = createCarrying(1);
    pickUp(carrying, 0, 0.5, 0.5);
    pickUp(carrying, 0, 0, 0);
    expect(carrying.nodes[0]).toBe(0);
  });

  it('ignores a person outside the crowd', () => {
    const carrying = createCarrying(1);
    pickUp(carrying, 5, 1, 0);
    pickUp(carrying, -1, 1, 0);
    expect([...carrying.nodes]).toEqual([0]);
  });
});

describe('stepWith', () => {
  it('bins it on a covered tile and leaves the tile clean', () => {
    const litter = createLitter(3, 1);
    const carrying = createCarrying(1);
    const cover = binCoverFor([{ tileX: 0, tileZ: 0, tilesX: 1, tilesZ: 1, reach: 0 }], 3, 1);
    pickUp(carrying, 0, 1, 0);
    stepWith(litter, carrying, cover, 0, 0, 0);
    expect(carrying.nodes[0]).toBe(0);
    expect(litterAt(litter, 0, 0)).toBe(0);
    expect(litter.version).toBe(0);
  });

  it('drops one piece on the sixth uncovered tile and none before it', () => {
    const litter = createLitter(CARRY_NODES, 1);
    const carrying = createCarrying(1);
    const cover = nowhere(CARRY_NODES);
    pickUp(carrying, 0, 1, 0);
    for (let x = 0; x < CARRY_NODES; x++) stepWith(litter, carrying, cover, 0, x, 0);
    for (let x = 0; x < CARRY_NODES - 1; x++) expect(litterAt(litter, x, 0)).toBe(0);
    expect(litterAt(litter, CARRY_NODES - 1, 0)).toBe(PIECE);
    expect(carrying.nodes[0]).toBe(0);
    expect(litter.version).toBe(1);
  });

  it('does nothing for an empty-handed guest', () => {
    const litter = createLitter(1, 1);
    const carrying = createCarrying(1);
    stepWith(litter, carrying, nowhere(1), 0, 0, 0);
    expect(litterAt(litter, 0, 0)).toBe(0);
    expect(litter.version).toBe(0);
  });

  it('clamps a tile at fully fouled', () => {
    const litter = createLitter(1, 1);
    const carrying = createCarrying(1);
    for (let piece = 0; piece < 10; piece++) {
      pickUp(carrying, 0, 1, 0);
      for (let step = 0; step < CARRY_NODES; step++) {
        stepWith(litter, carrying, nowhere(1), 0, 0, 0);
      }
    }
    expect(litterAt(litter, 0, 0)).toBe(1);
  });

  it('keeps counting down off the grid without dropping there', () => {
    const litter = createLitter(1, 1);
    const carrying = createCarrying(1);
    pickUp(carrying, 0, 1, 0);
    for (let step = 0; step < CARRY_NODES * 2; step++) {
      stepWith(litter, carrying, nowhere(1), 0, 7, 7);
    }
    expect(carrying.nodes[0]).toBe(CARRY_NODES);
    expect(litter.version).toBe(0);
  });
});

describe('litterAt and sweep', () => {
  it('answers 0 outside the grid', () => {
    const litter = createLitter(2, 2);
    litter.level.fill(1);
    expect(litterAt(litter, -1, 0)).toBe(0);
    expect(litterAt(litter, 0, 2)).toBe(0);
    expect(litterAt(litter, 1, 1)).toBe(1);
  });

  it('clears one tile and moves the version', () => {
    const litter = createLitter(2, 1);
    litter.level.fill(0.75);
    sweep(litter, 1, 0);
    expect(litterAt(litter, 1, 0)).toBe(0);
    expect(litterAt(litter, 0, 0)).toBe(0.75);
    expect(litter.version).toBe(1);
  });
});

describe('mostLittered', () => {
  it('takes the worst eligible tile at or above the threshold', () => {
    const litter = createLitter(4, 1);
    litter.level.set([0.25, 1, 0.75, 0.5]);
    expect(mostLittered(litter, () => true, SWEEP_ABOVE)).toBe(1);
    expect(mostLittered(litter, (tile) => tile !== 1, SWEEP_ABOVE)).toBe(2);
    expect(mostLittered(litter, (tile) => tile === 0, SWEEP_ABOVE)).toBe(-1);
    expect(mostLittered(litter, (tile) => tile === 3, SWEEP_ABOVE)).toBe(3);
  });

  it('breaks ties towards the lower index', () => {
    const litter = createLitter(3, 1);
    litter.level.set([0.5, 0.75, 0.75]);
    expect(mostLittered(litter, () => true, SWEEP_ABOVE)).toBe(1);
  });

  it('never picks a clean tile, even at a threshold of nothing', () => {
    expect(mostLittered(createLitter(3, 3), () => true, 0)).toBe(-1);
  });
});

describe('binCoverFor', () => {
  it('covers the reach around the footprint and not one tile past it', () => {
    const cover = binCoverFor([{ tileX: 4, tileZ: 4, tilesX: 2, tilesZ: 1, reach: 3 }], 12, 12);
    const covered = (x: number, z: number): number => cover[z * 12 + x]!;
    expect(covered(1, 1)).toBe(1);
    expect(covered(8, 7)).toBe(1);
    expect(covered(0, 4)).toBe(0);
    expect(covered(9, 4)).toBe(0);
    expect(covered(4, 8)).toBe(0);
    expect(covered(1, 0)).toBe(0);
  });

  it('is clipped to the grid', () => {
    const cover = binCoverFor([{ tileX: 0, tileZ: 0, tilesX: 1, tilesZ: 1, reach: 3 }], 2, 2);
    expect([...cover]).toEqual([1, 1, 1, 1]);
  });
});

describe('pruneLitter', () => {
  it('clears only the tiles it is told no longer keep litter', () => {
    const litter = createLitter(2, 2);
    litter.level.fill(0.5);
    pruneLitter(litter, (x, z) => x === 0 || z === 0);
    expect([...litter.level]).toEqual([0.5, 0.5, 0.5, 0]);
    expect(litter.version).toBe(1);
  });

  it('leaves the version alone when nothing was cleared', () => {
    const litter = createLitter(2, 2);
    pruneLitter(litter, () => false);
    expect(litter.version).toBe(0);
  });
});

describe('litterSummary', () => {
  it('counts the tiles a cleaner would walk to and names the worst', () => {
    const litter = createLitter(3, 2);
    litter.level.set([0.25, 0.5, 0, 0, 1, 0.75]);
    expect(litterSummary(litter)).toEqual({
      worst: { tileX: 1, tileZ: 1 },
      worstLevel: 1,
      fouled: 3,
    });
  });

  it('names nothing on clean paths', () => {
    expect(litterSummary(createLitter(2, 2))).toEqual({ worst: null, worstLevel: 0, fouled: 0 });
  });
});
