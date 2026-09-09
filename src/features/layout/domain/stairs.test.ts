import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { BOARDWALK_ID, PATH_ID, STAIRS_ID } from './resortPlan';
import type { Tile } from './resortLayout';
import { stairTilesFor, type LevelProvider } from './stairs';

const tiles = (...pairs: readonly [number, number][]): Tile[] => pairs.map(([x, z]) => ({ x, z }));

/** A level field from an explicit table; anything unlisted is at sea level. */
const levels =
  (table: Record<string, number>): LevelProvider =>
  (x, z) =>
    table[`${x},${z}`] ?? 0;

/** A plot where everything north of `z` stands one level up. */
const benchAt =
  (z: number): LevelProvider =>
  (_x, tileZ) =>
    tileZ < z ? 1 : 0;

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
    // Unturned the model climbs north, and a turn of one swings that face west.
    facing([1, 0], 0);
    facing([0, 1], 1);
    facing([1, 2], 2);
    facing([2, 1], 3);
  });

  it('lays no flight towards higher ground nobody paved', () => {
    // The step is there, but there is nothing above it to climb to: a flight
    // ending in a lawn reads as a mistake rather than as a shortcut.
    expect(stairTilesFor(tiles([0, 1]), benchAt(1))).toEqual([]);
  });

  it('lays no flight down a step, only up one', () => {
    // The upper tile of a step has lower paving beside it and is still a slab;
    // one step yields exactly one flight, on its lower side.
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
    // `elevationFor` refuses a two-level step, so this cannot come off a plan —
    // but a flight is one level of model, and it must not be stretched over two.
    expect(stairTilesFor(tiles([0, 0], [0, 1]), levels({ '0,0': 2 }))).toEqual([]);
  });

  it('picks one direction for a path that turns on a step, north first', () => {
    // One tile cannot climb two ways. Which way it picks is a fact about the
    // compass order rather than about the order the tiles were paved in.
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
    // The contract the art is authored to: the lowest tread starts a step above
    // a path slab and the highest is flush with a slab one level up. Both models
    // are hand-authored in `voxel-gen/`, so this is what holds them together.
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
