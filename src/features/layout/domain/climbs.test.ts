import { describe, expect, it } from 'vitest';
import { ORIGINAL_TYPES } from '../../catalog/domain/objectTypes';
import { elevationFor, levelAt, type LevelProvider } from './elevation';
import { clampParams, generateResort } from './resortGenerator';
import { layoutResort, type LayoutItem, type Tile } from './resortLayout';
import { climbKindAt, climbTilesFor } from './climbs';
import { stairTilesFor, type PavedProvider } from './stairs';

const tiles = (...pairs: readonly [number, number][]): Tile[] => pairs.map(([x, z]) => ({ x, z }));

const levels =
  (table: Record<string, number>): LevelProvider =>
  (x, z) =>
    table[`${x},${z}`] ?? 0;

const benchAt =
  (z: number): LevelProvider =>
  (_x, tileZ) =>
    tileZ < z ? 1 : 0;

const nowhere: PavedProvider = () => false;

const on =
  (...pairs: readonly [number, number][]): PavedProvider =>
  (x, z) =>
    pairs.some(([px, pz]) => px === x && pz === z);

describe('climbTilesFor', () => {
  it('lays a ramp up a straight run, its head against the step and its foot below', () => {
    expect(climbTilesFor(tiles([0, 0], [0, 1], [0, 2]), benchAt(1), nowhere)).toEqual([
      { tile: { x: 0, z: 1 }, rotation: 0, kind: 'ramp-head' },
      { tile: { x: 0, z: 2 }, rotation: 0, kind: 'ramp-foot' },
    ]);
  });

  it('lays stairs where only one tile is paved below the step', () => {
    expect(climbTilesFor(tiles([0, 0], [0, 1]), benchAt(1), nowhere)).toEqual([
      { tile: { x: 0, z: 1 }, rotation: 0, kind: 'stairs' },
    ]);
  });

  it('keeps a staircase stairs, and lays no foot below it', () => {
    expect(climbTilesFor(tiles([0, 0], [0, 1], [0, 2]), benchAt(1), on([0, 1]))).toEqual([
      { tile: { x: 0, z: 1 }, rotation: 0, kind: 'stairs' },
    ]);
  });

  it('keeps the head stairs where the tile below it is a staircase', () => {
    expect(climbTilesFor(tiles([0, 0], [0, 1], [0, 2]), benchAt(1), on([0, 2]))).toEqual([
      { tile: { x: 0, z: 1 }, rotation: 0, kind: 'stairs' },
    ]);
  });

  it('lays two flights where two steps follow one another, there being no room for a foot', () => {
    const twoSteps = levels({ '0,0': 2, '0,1': 1 });
    expect(climbTilesFor(tiles([0, 0], [0, 1], [0, 2]), twoSteps, nowhere)).toEqual([
      { tile: { x: 0, z: 1 }, rotation: 0, kind: 'stairs' },
      { tile: { x: 0, z: 2 }, rotation: 0, kind: 'stairs' },
    ]);
  });

  it('gives a foot two heads could share to the north one, and the other stairs', () => {
    const corner = levels({ '1,-1': 1, '-1,1': 1 });
    const paved = tiles([1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]);
    expect(climbTilesFor(paved, corner, nowhere)).toEqual([
      { tile: { x: 1, z: 0 }, rotation: 0, kind: 'ramp-head' },
      { tile: { x: 1, z: 1 }, rotation: 0, kind: 'ramp-foot' },
      { tile: { x: 0, z: 1 }, rotation: 1, kind: 'stairs' },
    ]);
  });

  it('chains a ramp onto the foot of the next one up, round a switchback', () => {
    const switchback = levels({ '0,-1': 2, '0,0': 1, '0,1': 1 });
    const paved = tiles([0, -1], [0, 0], [0, 1], [1, 1], [2, 1]);
    expect(climbTilesFor(paved, switchback, nowhere)).toEqual([
      { tile: { x: 0, z: 0 }, rotation: 0, kind: 'ramp-head' },
      { tile: { x: 0, z: 1 }, rotation: 0, kind: 'ramp-foot' },
      { tile: { x: 1, z: 1 }, rotation: 1, kind: 'ramp-head' },
      { tile: { x: 2, z: 1 }, rotation: 1, kind: 'ramp-foot' },
    ]);
  });

  it('keeps a flight where its head would stand across a path running past the step', () => {
    const paved = tiles([1, 0], [0, 1], [1, 1], [2, 1], [1, 2]);
    expect(climbTilesFor(paved, benchAt(1), nowhere)).toEqual([
      { tile: { x: 1, z: 1 }, rotation: 0, kind: 'stairs' },
    ]);
  });

  it('lays two ramps side by side up a two-wide run', () => {
    const paved = tiles([0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]);
    expect(
      climbTilesFor(paved, benchAt(1), nowhere).map(({ tile, kind }) => ({ tile, kind })),
    ).toEqual([
      { tile: { x: 0, z: 1 }, kind: 'ramp-head' },
      { tile: { x: 1, z: 1 }, kind: 'ramp-head' },
      { tile: { x: 0, z: 2 }, kind: 'ramp-foot' },
      { tile: { x: 1, z: 2 }, kind: 'ramp-foot' },
    ]);
  });

  it('turns a ramp as stairs.ts turns the flight it replaces, its head on the flight tile', () => {
    const run = [
      { dx: 0, dz: -1 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 1, dz: 0 },
    ];
    for (const { dx, dz } of run) {
      const top: [number, number] = [5 + dx, 5 + dz];
      const paved = tiles(top, [5, 5], [5 - dx, 5 - dz]);
      const higher = levels({ [`${top[0]},${top[1]}`]: 1 });
      const [flight] = stairTilesFor(tiles(top, [5, 5]), higher);
      const climbs = climbTilesFor(paved, higher, nowhere);
      expect(climbs).toEqual([
        { tile: flight!.tile, rotation: flight!.rotation, kind: 'ramp-head' },
        { tile: { x: 5 - dx, z: 5 - dz }, rotation: flight!.rotation, kind: 'ramp-foot' },
      ]);
    }
  });
});

describe('climbKindAt', () => {
  it('counts the tile asked about as paved, as the pointer asks before it lays it', () => {
    expect(climbKindAt({ x: 0, z: 2 }, on([0, 0], [0, 1]), benchAt(1), nowhere)).toEqual({
      tile: { x: 0, z: 2 },
      rotation: 0,
      kind: 'ramp-foot',
    });
  });

  it('answers what climbTilesFor answers on every tile of a generated plot', () => {
    const types: LayoutItem[] = ORIGINAL_TYPES.map((type) => ({
      id: type.id,
      tilesX: type.model.tiles.x,
      tilesZ: type.model.tiles.z,
      width: type.model.width,
      depth: type.model.depth,
      category: type.category,
    }));
    const plan = generateResort(
      ORIGINAL_TYPES.map((type) => ({
        id: type.id,
        tilesX: type.model.tiles.x,
        tilesZ: type.model.tiles.z,
        category: type.category,
        placement: type.model.placement,
      })),
      clampParams({ tilesX: 112, tilesZ: 100, seed: 3, density: 0.7 }),
    );
    const layout = layoutResort(types, plan);
    const elevation = elevationFor(plan);
    const levelOf: LevelProvider = (x, z) => levelAt(elevation, x, z);
    const paved = layout.paths.map((path) => ({ x: path.tileX, z: path.tileZ }));
    const keys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
    const isPaved: PavedProvider = (x, z) => keys.has(`${x},${z}`);
    const whole = climbTilesFor(paved, levelOf, nowhere);
    const oneByOne = paved.flatMap((tile) => climbKindAt(tile, isPaved, levelOf, nowhere) ?? []);
    expect(oneByOne).toEqual(whole);
    expect(whole.some((climb) => climb.kind === 'ramp-head')).toBe(true);
  });
});
