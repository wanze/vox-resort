import { describe, expect, it } from 'vitest';
import { railsAt, railTilesFor, type RailTile } from './railings';
import type { Tile } from './resortLayout';

const groundOf =
  (rows: readonly string[]) =>
  (tileX: number, tileZ: number): number =>
    Number(rows[tileZ]?.[tileX] ?? 0);

const pavedOf = (tiles: readonly Tile[]) => {
  const keys = new Set(tiles.map((tile) => `${tile.x},${tile.z}`));
  return (tileX: number, tileZ: number): boolean => keys.has(`${tileX},${tileZ}`);
};

const sides = (rails: readonly RailTile[]): number[] => rails.map((rail) => rail.rotation);

describe('railsAt', () => {
  const bench = groundOf(['111', '111', '000']);

  it('rails the edge a path runs along where the ground beside it drops', () => {
    const paved = [
      { x: 0, z: 1 },
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ];
    const rails = railsAt({ x: 1, z: 1 }, pavedOf(paved), bench);
    expect(rails).toEqual([{ tile: { x: 1, z: 1 }, rotation: 2, kind: 'edge' }]);
  });

  it('rails both edges of a tile on the corner of a terrace', () => {
    const corner = groundOf(['110', '110', '000']);
    const rails = railsAt({ x: 1, z: 1 }, pavedOf([{ x: 1, z: 1 }]), corner);
    expect(sides(rails).toSorted()).toEqual([2, 3]);
    expect(rails.every((rail) => rail.kind === 'edge')).toBe(true);
  });

  it('never rails an edge the paving carries on across', () => {
    const paved = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ];
    expect(railsAt({ x: 1, z: 1 }, pavedOf(paved), bench)).toEqual([]);
  });

  it('leaves a path with higher ground beside it unrailed', () => {
    expect(railsAt({ x: 1, z: 2 }, pavedOf([{ x: 1, z: 2 }]), bench)).toEqual([]);
  });

  it('guards a flight up both flanks, turned the way it climbs', () => {
    const paved = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ];
    expect(railsAt({ x: 1, z: 2 }, pavedOf(paved), bench)).toEqual([
      { tile: { x: 1, z: 2 }, rotation: 0, kind: 'flight' },
    ]);
  });

  it('leaves a staircase wider than one tile open', () => {
    const paved = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
    ];
    expect(railsAt({ x: 1, z: 2 }, pavedOf(paved), bench)).toEqual([]);
    expect(railsAt({ x: 2, z: 2 }, pavedOf(paved), bench)).toEqual([]);
  });

  it('rails nothing at all on flat ground', () => {
    const flat = groundOf(['000', '000', '000']);
    expect(railsAt({ x: 1, z: 1 }, pavedOf([{ x: 1, z: 1 }]), flat)).toEqual([]);
  });
});

describe('railTilesFor', () => {
  it('classifies a whole set of paved tiles the same way one tile is', () => {
    const bench = groundOf(['11111', '11111', '00000']);
    const paved = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
    ];
    const rails = railTilesFor(paved, bench);
    expect(rails).toEqual([
      { tile: { x: 1, z: 1 }, rotation: 2, kind: 'edge' },
      { tile: { x: 2, z: 2 }, rotation: 0, kind: 'flight' },
    ]);
  });
});

const sea = (_tileX: number, tileZ: number): boolean => tileZ >= 2;

const flat = (): number => 0;

describe('railsAt, over water', () => {
  it('rails both flanks of a pier, though nothing beside it is any lower', () => {
    const pier = pavedOf([
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 1, z: 3 },
    ]);
    expect(railsAt({ x: 1, z: 2 }, pier, flat)).toEqual([]);
    expect(sides(railsAt({ x: 1, z: 2 }, pier, flat, sea)).toSorted()).toEqual([1, 3]);
  });

  it('rails a pier with the lit pier rail, and the dry paving with the plain one', () => {
    const pier = pavedOf([
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ]);
    const shore = pavedOf([{ x: 1, z: 1 }]);
    expect(railsAt({ x: 1, z: 2 }, pier, flat, sea).map((rail) => rail.kind)).toEqual([
      'pier',
      'pier',
      'pier',
    ]);
    expect(railsAt({ x: 1, z: 1 }, shore, flat, sea).map((rail) => rail.kind)).toEqual(['edge']);
  });

  it('rails the head of a pier on three sides and leaves the way back open', () => {
    const pier = pavedOf([
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 1, z: 3 },
    ]);
    expect(sides(railsAt({ x: 1, z: 3 }, pier, flat, sea)).toSorted()).toEqual([1, 2, 3]);
  });

  it('rails the last tile of dry paving against the water in front of it', () => {
    const shore = pavedOf([{ x: 1, z: 1 }]);
    expect(sides(railsAt({ x: 1, z: 1 }, shore, flat, sea))).toEqual([2]);
  });

  it('leaves dry ground alone, however flat it is', () => {
    const inland = pavedOf([{ x: 1, z: 0 }]);
    expect(railsAt({ x: 1, z: 0 }, inland, flat, sea)).toEqual([]);
  });
});

const channel = (_x: number, tileZ: number): boolean => tileZ >= 2;

const lake = (_x: number, tileZ: number): boolean => tileZ >= 2 && tileZ <= 4;

const openWater = (): boolean => true;

describe('railsAt, over a crossing', () => {
  const crossing = pavedOf([
    { x: 1, z: 1 },
    { x: 1, z: 2 },
    { x: 1, z: 3 },
    { x: 1, z: 4 },
    { x: 1, z: 5 },
  ]);

  it('never stands the ordinary rail on a raised span, where it rails a flat pier', () => {
    expect(railsAt({ x: 1, z: 3 }, crossing, flat, lake).map((rail) => rail.kind)).toEqual([
      'pier',
      'pier',
    ]);
    expect(railsAt({ x: 1, z: 3 }, crossing, flat, lake, lake)).toEqual([
      { tile: { x: 1, z: 3 }, rotation: 1, kind: 'span' },
      { tile: { x: 1, z: 3 }, rotation: 3, kind: 'span' },
    ]);
  });

  it('rails a ramp up both flanks with the two mirrored parapets', () => {
    expect(railsAt({ x: 1, z: 2 }, crossing, flat, lake, lake)).toEqual([
      { tile: { x: 1, z: 2 }, rotation: 1, kind: 'ramp-right' },
      { tile: { x: 1, z: 2 }, rotation: 3, kind: 'ramp-left' },
    ]);
    expect(railsAt({ x: 1, z: 4 }, crossing, flat, lake, lake)).toEqual([
      { tile: { x: 1, z: 4 }, rotation: 1, kind: 'ramp-left' },
      { tile: { x: 1, z: 4 }, rotation: 3, kind: 'ramp-right' },
    ]);
  });

  it('leaves the junction of two crossings open all four ways', () => {
    const junction = pavedOf([
      { x: 1, z: 1 },
      { x: 1, z: 2 },
      { x: 1, z: 3 },
      { x: 1, z: 4 },
      { x: 1, z: 5 },
      { x: 0, z: 3 },
      { x: 2, z: 3 },
    ]);
    const everywhere = (tileX: number, tileZ: number): boolean => lake(tileX, tileZ) || tileZ === 3;
    expect(railsAt({ x: 1, z: 3 }, junction, flat, everywhere, everywhere)).toEqual([]);
  });

  it('rails a platform round its rim and nowhere across its middle', () => {
    const tiles: Tile[] = [];
    for (let x = 0; x < 3; x++) for (let z = 2; z <= 4; z++) tiles.push({ x, z });
    const platform = pavedOf(tiles);
    expect(railsAt({ x: 1, z: 3 }, platform, flat, openWater, openWater)).toEqual([]);
    expect(sides(railsAt({ x: 0, z: 2 }, platform, flat, openWater, openWater))).toEqual([0, 1]);
    expect(railsAt({ x: 1, z: 4 }, platform, flat, openWater, openWater)).toEqual([
      { tile: { x: 1, z: 4 }, rotation: 2, kind: 'span' },
    ]);
  });

  it('rails the head of a crossing that stops one tile out', () => {
    const stub = pavedOf([
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ]);
    expect(railsAt({ x: 1, z: 2 }, stub, flat, lake, lake).map((rail) => rail.kind)).toEqual([
      'ramp-right',
      'span',
      'ramp-left',
    ]);
  });

  it('still rails the dry paving along the bank, which is not the bridge', () => {
    const bank = pavedOf([
      { x: 0, z: 1 },
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 1, z: 2 },
    ]);
    expect(sides(railsAt({ x: 0, z: 1 }, bank, flat, channel, channel))).toEqual([2]);
    expect(railsAt({ x: 1, z: 1 }, bank, flat, channel, channel)).toEqual([]);
  });
});

describe('railTilesFor, over water', () => {
  it('carries the water rule over a whole run of paving', () => {
    const pier: Tile[] = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ];
    const rails = railTilesFor(
      pier,
      () => 0,
      (_x, tileZ) => tileZ >= 2,
    );
    expect(rails.map((rail) => ({ z: rail.tile.z, rotation: rail.rotation }))).toEqual([
      { z: 2, rotation: 1 },
      { z: 2, rotation: 2 },
      { z: 2, rotation: 3 },
    ]);
  });
});
