import { describe, expect, it } from 'vitest';
import { binTilesFor, type BinGround, type Standing } from './litterBins';
import type { TileRect } from './parkShapes';

// Streets drawn as '=', grass as '.', sand as ':', and '#' where nothing stands.
function groundOf(rows: readonly string[]): BinGround {
  const at = (x: number, z: number): string => rows[z]?.[x] ?? '';
  return {
    tilesX: rows[0]!.length,
    tilesZ: rows.length,
    isStreet: (x, z) => at(x, z) === '=',
    canStand: (x, z) => at(x, z) !== '' && at(x, z) !== '#',
    isRouted: (x, z) => at(x, z) === '.',
  };
}

const rect = (x0: number, z0: number, x1 = x0, z1 = z0): TileRect => ({ x0, x1, z0, z1 });

const shop = (at: TileRect, ...doorSides: Standing['doorSides']): Standing => ({
  rect: at,
  reached: true,
  doorSides,
});

describe('binTilesFor', () => {
  const street = ['=======', '.......', '.......', '.......', '.......'];

  it('stands a bin beside a stall, by the street', () => {
    const stall = rect(2, 2, 3, 3);
    const tiles = binTilesFor({
      stalls: [stall],
      standing: [shop(stall, 2)],
      bins: [],
      reach: 3,
      ground: groundOf(street),
    });
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.z).toBe(1);
    expect(tiles[0]!.x === 1 || tiles[0]!.x === 4).toBe(true);
  });

  it('keeps off the side a door is on', () => {
    const stall = rect(2, 1, 3, 2);
    const [tile] = binTilesFor({
      stalls: [stall],
      standing: [shop(stall, 0)],
      bins: [],
      reach: 3,
      ground: groundOf(street),
    });
    expect(tile!.z).not.toBe(3);
  });

  it('shares one bin between two stalls side by side, and none where one already stands', () => {
    const one = rect(2, 2);
    const other = rect(3, 2);
    const ground = groundOf(street);
    const standing = [shop(one, 2), shop(other, 2)];
    expect(
      binTilesFor({ stalls: [one, other], standing, bins: [], reach: 3, ground }),
    ).toHaveLength(1);
    const bin = rect(4, 1);
    expect(
      binTilesFor({
        stalls: [one],
        standing: [...standing, shop(bin)],
        bins: [bin],
        reach: 3,
        ground,
      }),
    ).toEqual([]);
  });

  it('never stands where it would lengthen the only way from a door to the street', () => {
    const rows = ['=####', '....#', '#.#.#', '#.###'];
    const stall = rect(2, 2);
    const tiles = binTilesFor({
      stalls: [stall],
      standing: [shop(rect(2, 3), 3), { rect: stall, reached: false, doorSides: [] }],
      bins: [],
      reach: 3,
      ground: groundOf(rows),
    });
    expect(tiles).toEqual([{ x: 3, z: 1 }]);
  });

  it('stands on the sand beside a beach stall away from any street', () => {
    const rows = [':::::', ':::::', ':::::'];
    const stall = rect(2, 1);
    const tiles = binTilesFor({
      stalls: [stall],
      standing: [{ rect: stall, reached: false, doorSides: [] }],
      bins: [],
      reach: 3,
      ground: groundOf(rows),
    });
    expect(tiles).toEqual([{ x: 1, z: 0 }]);
  });
});
