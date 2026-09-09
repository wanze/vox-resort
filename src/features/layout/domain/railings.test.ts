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
