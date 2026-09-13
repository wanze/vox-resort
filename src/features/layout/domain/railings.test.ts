import { describe, expect, it } from 'vitest';
import { railsAt, railTilesFor, type RailTile } from './railings';
import type { Tile } from './resortLayout';

/** A level field from a picture: one string per row, digits for levels. */
const groundOf =
  (rows: readonly string[]) =>
  (tileX: number, tileZ: number): number =>
    Number(rows[tileZ]?.[tileX] ?? 0);

/** A paved set from a list of tiles. */
const pavedOf = (tiles: readonly Tile[]) => {
  const keys = new Set(tiles.map((tile) => `${tile.x},${tile.z}`));
  return (tileX: number, tileZ: number): boolean => keys.has(`${tileX},${tileZ}`);
};

const sides = (rails: readonly RailTile[]): number[] => rails.map((rail) => rail.rotation);

describe('railsAt', () => {
  // A bench one level up, with the ground to the south at sea level.
  const bench = groundOf(['111', '111', '000']);

  it('rails the edge a path runs along where the ground beside it drops', () => {
    const paved = [
      { x: 0, z: 1 },
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ];
    const rails = railsAt({ x: 1, z: 1 }, pavedOf(paved), bench);
    // A turn of two faces south, which is where the drop is.
    expect(rails).toEqual([{ tile: { x: 1, z: 1 }, rotation: 2, kind: 'edge' }]);
  });

  it('rails both edges of a tile on the corner of a terrace', () => {
    const corner = groundOf(['110', '110', '000']);
    const rails = railsAt({ x: 1, z: 1 }, pavedOf([{ x: 1, z: 1 }]), corner);
    expect(sides(rails).toSorted()).toEqual([2, 3]);
    expect(rails.every((rail) => rail.kind === 'edge')).toBe(true);
  });

  it('never rails an edge the paving carries on across', () => {
    // The same drop, but with a path down onto the lower ground: that edge is
    // the way through rather than a fall.
    const paved = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ];
    expect(railsAt({ x: 1, z: 1 }, pavedOf(paved), bench)).toEqual([]);
  });

  it('leaves a path with higher ground beside it unrailed', () => {
    // Nothing to fall off: the step is above the path, not below it.
    expect(railsAt({ x: 1, z: 2 }, pavedOf([{ x: 1, z: 2 }]), bench)).toEqual([]);
  });

  it('guards a flight up both flanks, turned the way it climbs', () => {
    const paved = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ];
    // The lower tile of the step climbs north, and its balustrade goes with it.
    expect(railsAt({ x: 1, z: 2 }, pavedOf(paved), bench)).toEqual([
      { tile: { x: 1, z: 2 }, rotation: 0, kind: 'flight' },
    ]);
  });

  it('leaves a staircase wider than one tile open', () => {
    // Two flights side by side are one wide staircase, and a balustrade would
    // fall down the middle of it.
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
    // A walk along the bench that turns down a flight at its eastern end.
    const paved = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
    ];
    const rails = railTilesFor(paved, bench);
    expect(rails).toEqual([
      // The tile beside the flight keeps its drop to the south.
      { tile: { x: 1, z: 1 }, rotation: 2, kind: 'edge' },
      // The tile the flight leaves from is open on that side, because the
      // flight is the way down.
      { tile: { x: 2, z: 2 }, rotation: 0, kind: 'flight' },
    ]);
  });
});

/** Everything from row 2 down is sea. */
const sea = (_tileX: number, tileZ: number): boolean => tileZ >= 2;

/** A plot with no terraces on it, which is what a bay in front of one is. */
const flat = (): number => 0;

describe('railsAt, over water', () => {
  it('rails both flanks of a pier, though nothing beside it is any lower', () => {
    // The whole point of the water rule. A jetty stands at sea level and so does
    // the sea, so the level test alone says there is nothing to fall into.
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

/** Inland water from row 2 down, which a bridge stands a metre above. */
const channel = (_x: number, tileZ: number): boolean => tileZ >= 2;

/** A lake three rows deep, so a crossing of it has a deck in its middle. */
const lake = (_x: number, tileZ: number): boolean => tileZ >= 2 && tileZ <= 4;

/** Water under everything, which is what a platform out on a lake stands over. */
const openWater = (): boolean => true;

describe('railsAt, over a crossing', () => {
  /** A crossing north to south at x = 1, over rows 2 and 3 of the channel. */
  const crossing = pavedOf([
    { x: 1, z: 1 },
    { x: 1, z: 2 },
    { x: 1, z: 3 },
    { x: 1, z: 4 },
    { x: 1, z: 5 },
  ]);

  it('never stands the ordinary rail on a raised span, where it rails a flat pier', () => {
    // The same paving over the same water, asked twice. A jetty lies on the sea
    // and takes the ordinary rail; a bridge's deck is a metre up, so that rail
    // would stand in the river, inside the deck.
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
    // The ramp at z = 2 comes off the bank to the north, so its turn is 0. Looking
    // up the climb — south — the west flank is on the right and the east on the left.
    expect(railsAt({ x: 1, z: 2 }, crossing, flat, lake, lake)).toEqual([
      { tile: { x: 1, z: 2 }, rotation: 1, kind: 'ramp-right' },
      { tile: { x: 1, z: 2 }, rotation: 3, kind: 'ramp-left' },
    ]);
    // And the far ramp comes off the south bank, which swaps which flank is which.
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
    // A corner is railed along its two outer edges.
    expect(sides(railsAt({ x: 0, z: 2 }, platform, flat, openWater, openWater))).toEqual([0, 1]);
    // And an edge tile along its one.
    expect(railsAt({ x: 1, z: 4 }, platform, flat, openWater, openWater)).toEqual([
      { tile: { x: 1, z: 4 }, rotation: 2, kind: 'span' },
    ]);
  });

  it('rails the head of a crossing that stops one tile out', () => {
    // Half a crossing: the ramp's far end is open water.
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
    // A promenade down the near bank with one crossing off it. The tile the
    // crossing leaves from is open to it — paving is always the way through —
    // and the tiles either side of that are railed against the river as they
    // would be against any other water.
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
    // Only the wet tile is railed: the one on dry land has flat, unpaved ground
    // on three sides of it, which is a verge rather than a drop.
    expect(rails.map((rail) => ({ z: rail.tile.z, rotation: rail.rotation }))).toEqual([
      { z: 2, rotation: 1 },
      { z: 2, rotation: 2 },
      { z: 2, rotation: 3 },
    ]);
  });
});
