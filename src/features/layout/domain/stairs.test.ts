import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { BOARDWALK_ID, PATH_ID, STAIRS_ID } from './resortPlan';
import type { Tile } from './resortLayout';
import type { LevelProvider } from './elevation';
import { climbAt, stairTilesFor } from './stairs';

const tiles = (...pairs: readonly [number, number][]): Tile[] => pairs.map(([x, z]) => ({ x, z }));

const levels =
  (table: Record<string, number>): LevelProvider =>
  (x, z) =>
    table[`${x},${z}`] ?? 0;

const benchAt =
  (z: number): LevelProvider =>
  (_x, tileZ) =>
    tileZ < z ? 1 : 0;

const pavedOn =
  (...on: readonly [number, number][]) =>
  (x: number, z: number) =>
    on.some(([px, pz]) => px === x && pz === z);

describe('climbAt', () => {
  it('faces the paved neighbour one level up', () => {
    expect(climbAt({ x: 0, z: 1 }, pavedOn([0, 0]), benchAt(1))).toBe(0);
  });

  it('is not a step where the ground does not rise', () => {
    expect(climbAt({ x: 0, z: 1 }, pavedOn([0, 0]), () => 0)).toBeNull();
  });

  it('does not ask whether the tile itself is paved', () => {
    expect(climbAt({ x: 0, z: 1 }, pavedOn([0, 0]), benchAt(1))).toBe(0);
    expect(climbAt({ x: 0, z: 1 }, pavedOn([0, 0], [0, 1]), benchAt(1))).toBe(0);
  });
});

describe('stairTilesFor', () => {
  it('lays no stairs on a flat plot', () => {
    expect(stairTilesFor(tiles([0, 0], [0, 1], [1, 0], [1, 1]), () => 0)).toEqual([]);
  });

  it('lays a flight on the lower tile of a step, not the upper one', () => {
    const flights = stairTilesFor(tiles([0, 0], [0, 1]), benchAt(1));
    expect(flights).toEqual([{ tile: { x: 0, z: 1 }, rotation: 0 }]);
  });

  it('turns the flight to face the higher ground, whichever side it is on', () => {
    const facing = (higher: [number, number], rotation: number): void => {
      const flights = stairTilesFor(
        tiles([1, 1], higher),
        levels({ [`${higher[0]},${higher[1]}`]: 1 }),
      );
      expect({ higher, flights }).toEqual({
        higher,
        flights: [{ tile: { x: 1, z: 1 }, rotation }],
      });
    };
    facing([1, 0], 0);
    facing([0, 1], 1);
    facing([1, 2], 2);
    facing([2, 1], 3);
  });

  it('lays no flight towards higher ground nobody paved', () => {
    expect(stairTilesFor(tiles([0, 1]), benchAt(1))).toEqual([]);
  });

  it('lays no flight down a step, only up one', () => {
    const flights = stairTilesFor(tiles([0, 0], [0, 1], [0, 2]), benchAt(1));
    expect(flights.map((flight) => flight.tile)).toEqual([{ x: 0, z: 1 }]);
  });

  it('lays a flight per step where two steps run one after another', () => {
    const staircase = levels({ '0,0': 2, '0,1': 1 });
    const flights = stairTilesFor(tiles([0, 0], [0, 1], [0, 2]), staircase);
    expect(flights).toEqual([
      { tile: { x: 0, z: 1 }, rotation: 0 },
      { tile: { x: 0, z: 2 }, rotation: 0 },
    ]);
  });

  it('never climbs more than one level, so a cliff is not a flight', () => {
    expect(stairTilesFor(tiles([0, 0], [0, 1]), levels({ '0,0': 2 }))).toEqual([]);
  });

  it('picks one direction for a path that turns on a step, north first', () => {
    const corner = levels({ '1,0': 1, '0,1': 1 });
    const paved = tiles([1, 1], [1, 0], [0, 1]);
    expect(stairTilesFor(paved, corner)[0]).toEqual({ tile: { x: 1, z: 1 }, rotation: 0 });
    expect(stairTilesFor(paved.toReversed(), corner)[0]).toEqual({
      tile: { x: 1, z: 1 },
      rotation: 0,
    });
  });

  it('keeps the order the tiles came in, so the paving walk stays one pass', () => {
    const flights = stairTilesFor(tiles([0, 0], [1, 1], [1, 0], [0, 1]), benchAt(1));
    expect(flights.map((flight) => flight.tile)).toEqual([
      { x: 1, z: 1 },
      { x: 0, z: 1 },
    ]);
  });
});

describe('the stairs model', () => {
  it('climbs exactly one level above the paving it continues', () => {
    const paving = objectTypeById(PATH_ID).model.height;
    expect(objectTypeById(STAIRS_ID).model.height).toBe(paving + LEVEL_VOXELS);
  });

  it('is laid on the same slab the boardwalk is, so the two butt together', () => {
    expect(objectTypeById(BOARDWALK_ID).model.height).toBe(objectTypeById(PATH_ID).model.height);
  });

  it('fills the tile it claims, so a flight has no lip at either end', () => {
    const { model } = objectTypeById(STAIRS_ID);
    expect({ tiles: model.tiles, width: model.width, depth: model.depth }).toEqual({
      tiles: { x: 1, z: 1 },
      width: 16,
      depth: 16,
    });
  });
});
