import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { solidTopsOf, TILE_VOXELS, type PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById, solidTopsById } from '../../catalog/domain/objectTypes';
import { place } from '../../layout/domain/resortLayout';
import { ROTATIONS } from '../../layout/domain/rotation';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { clearShare, roofOver, skylineOf, type Skyline } from './sightLine';

function painted(
  fill: (x: number, y: number, z: number) => boolean,
  height: number,
): PaintedVoxel[] {
  const voxels: PaintedVoxel[] = [];
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < TILE_VOXELS; z++) {
      for (let x = 0; x < TILE_VOXELS; x++) if (fill(x, y, z)) voxels.push({ x, y, z, color: 0 });
    }
  }
  return voxels;
}

const tile = (voxels: PaintedVoxel[], height: number) => ({
  width: TILE_VOXELS,
  depth: TILE_VOXELS,
  height,
  voxels,
});

const edge = (x: number, z: number): boolean =>
  x === 0 || z === 0 || x === TILE_VOXELS - 1 || z === TILE_VOXELS - 1;

describe('solidTopsOf', () => {
  it('reads a box with a roof at the roof’s height', () => {
    const box = painted((x, y, z) => y === 11 || edge(x, z), 12);
    expect(solidTopsOf(tile(box, 12))).toEqual([12]);
  });

  it('reads a post or a fence round the tile as nothing in the way', () => {
    const post = painted((x, _y, z) => x === 8 && z === 8, 20);
    expect(solidTopsOf(tile(post, 20))).toEqual([0]);
    const fence = painted((x, _y, z) => x === 0 || z === 0 || x === 15 || z === 15, 6);
    expect(solidTopsOf(tile(fence, 6))).toEqual([0]);
  });
});

describe('skylineOf', () => {
  it('lands the hotel on its footprint and every tile of it, at each turn', () => {
    const hotel = objectTypeById('hotel').model;
    const item = {
      id: 'hotel',
      tilesX: hotel.tiles.x,
      tilesZ: hotel.tiles.z,
      width: hotel.width,
      depth: hotel.depth,
    };
    for (const rotation of ROTATIONS) {
      const placed = place(item, 'hotel@3,4', 3, 4, rotation);
      const skyline = skylineOf([placed], solidTopsById, 24, 24);
      for (let tileZ = 0; tileZ < 24; tileZ++) {
        for (let tileX = 0; tileX < 24; tileX++) {
          const inside =
            tileX >= 3 && tileX < 3 + placed.tilesX && tileZ >= 4 && tileZ < 4 + placed.tilesZ;
          const top = skyline.tops[tileZ * 24 + tileX]!;
          expect(top > 0, `rotation ${rotation}, tile ${tileX},${tileZ}`).toBe(inside);
        }
      }
    }
  });

  // The court's benches stand two voxels over its floor, on four tiles: a quarter of their cells.
  it('keeps the reference resort’s street lamps and tennis courts out of the way', () => {
    const world = referenceWorldOf(referenceJson);
    const standing = [...world.placements, ...world.props];
    const skyline = skylineOf(standing, solidTopsById, world.tilesX, world.tilesZ);
    const court = objectTypeById('tennis-court').model;
    const floor = Math.max(...solidTopsById('tennis-court')!.filter((top) => top < 6));
    const topOver = (placement: (typeof standing)[number]): number[] => {
      const tops: number[] = [];
      for (let z = placement.tileZ; z < placement.tileZ + placement.tilesZ; z++) {
        for (let x = placement.tileX; x < placement.tileX + placement.tilesX; x++) {
          tops.push(skyline.tops[z * world.tilesX + x]! - placement.y);
        }
      }
      return tops;
    };
    const lamps = standing.filter((placement) => placement.id === 'street-lamp');
    const courts = standing.filter((placement) => placement.id === court.id);
    expect(lamps.length).toBeGreaterThan(0);
    expect(courts.length).toBeGreaterThan(0);
    for (const lamp of lamps)
      for (const top of topOver(lamp)) expect(top).toBeLessThanOrEqual(floor);
    for (const each of courts) {
      for (const top of topOver(each)) expect(top).toBeLessThanOrEqual(floor + 2);
    }
  });
});

const open = (tilesX: number, tilesZ: number): Skyline => ({
  tilesX,
  tilesZ,
  tops: new Float32Array(tilesX * tilesZ),
});

const flat = (): number => 0;

// The wall's tile starts at 0.45 of the way; the last clear sample is one sample short of it.
const short = (share: number): void => {
  expect(share).toBeGreaterThanOrEqual(0.45 - 8 / 160);
  expect(share).toBeLessThan(0.45);
};

describe('clearShare', () => {
  const from = { x: 8, y: 10, z: 8 };
  const to = { x: 8 + 160, y: 10, z: 8 };

  it('is 1 over open ground', () => {
    expect(clearShare(open(16, 4), flat, from, to)).toBe(1);
  });

  it('stops about halfway at a wall halfway', () => {
    const walled = open(16, 4);
    walled.tops[5] = 30;
    short(clearShare(walled, flat, from, to));
  });

  it('stops at a terrace higher than the line', () => {
    short(clearShare(open(16, 4), (tileX) => (tileX >= 5 ? 24 : 0), from, to));
  });

  it('ignores whatever stands on the start tile', () => {
    const roofed = open(16, 4);
    roofed.tops[0] = 30;
    expect(clearShare(roofed, flat, from, to)).toBe(1);
  });
});

describe('roofOver', () => {
  it('finds a top above the point on its tile only, and nothing off the plot', () => {
    const roofed = open(4, 4);
    roofed.tops[5] = 30;
    expect(roofOver(roofed, { x: 24, y: 10, z: 24 })).toBe(true);
    expect(roofOver(roofed, { x: 24, y: 31, z: 24 })).toBe(false);
    expect(roofOver(roofed, { x: 8, y: 10, z: 8 })).toBe(false);
    expect(roofOver(roofed, { x: -8, y: 10, z: 8 })).toBe(false);
  });
});
