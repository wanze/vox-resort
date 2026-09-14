import { describe, expect, it } from 'vitest';
import {
  housingBlock,
  lotAnchor,
  PARK_DESIGNS,
  PARK_MIN,
  parkDesignsFor,
  parkLayout,
  type HousingBlock,
  type ParkLayout,
  type TileRect,
} from './districtLayouts';
import { rectTiles, runTiles, tableTiles } from './parkShapes';
import { tileKey } from './resortLayout';

const rect = (x0: number, z0: number, width: number, depth: number): TileRect => ({
  x0,
  x1: x0 + width - 1,
  z0,
  z1: z0 + depth - 1,
});

/** The distinct columns a block's houses start in. */
const columnsOf = (block: HousingBlock) => [...new Set(block.lots.map((lot) => lot.tileX))];

describe('housingBlock', () => {
  const HOUSE = { x: 3, z: 3 };

  it('stands rows of houses back to back, facing out to the streets', () => {
    const block = housingBlock(rect(0, 0, 18, 8), HOUSE, 1)!;
    const rows = new Map(block.lots.map((lot) => [lot.tileZ, lot.rotation]));
    expect([...rows.entries()]).toEqual([
      [1, 2],
      [4, 0],
    ]);
    expect(block.lanes).toEqual([]);
  });

  it('runs a lane between one pair of rows and the next', () => {
    const block = housingBlock(rect(0, 0, 18, 17), HOUSE, 1)!;
    expect(new Set(block.lots.map((lot) => lot.tileZ))).toEqual(new Set([1, 4, 10, 13]));
    expect(block.lanes).toEqual([8]);
  });

  it('centres the houses in the district', () => {
    const block = housingBlock(rect(10, 0, 19, 8), HOUSE, 1)!;
    const xs = [...new Set(block.lots.map((lot) => lot.tileX))];
    const left = xs[0]! - 10;
    const right = 10 + 19 - 1 - (xs.at(-1)! + HOUSE.x - 1);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('thins every row from both ends alike at a lower density', () => {
    const full = housingBlock(rect(0, 0, 21, 8), HOUSE, 1)!;
    const thin = housingBlock(rect(0, 0, 21, 8), HOUSE, 0.5)!;
    expect(columnsOf(full)).toHaveLength(5);
    expect(columnsOf(thin)).toEqual(columnsOf(full).slice(1, 4));
  });

  it('never overlaps two houses', () => {
    const block = housingBlock(rect(0, 0, 30, 30), { x: 4, z: 4 }, 1)!;
    const taken = new Set<string>();
    for (const lot of block.lots) {
      for (let x = lot.tileX; x < lot.tileX + 4; x++) {
        for (let z = lot.tileZ; z < lot.tileZ + 4; z++) {
          expect(taken.has(`${x},${z}`)).toBe(false);
          taken.add(`${x},${z}`);
        }
      }
    }
  });

  it('mixes accents into the same places of every row, symmetrically', () => {
    const block = housingBlock(rect(0, 0, 40, 17), HOUSE, 1, {
      accent: { footprint: { x: 4, z: 4 }, share: 0.2 },
    })!;
    const rows = [...new Set(block.lots.map((lot) => lot.tileZ))];
    expect(rows.length).toBeGreaterThan(1);
    for (const z of rows) {
      const roles = block.lots.filter((lot) => lot.tileZ === z).map((lot) => lot.role);
      expect(roles[0]).toBe('accent');
      expect(roles).toEqual(roles.toReversed());
      expect(roles.filter((role) => role === 'house').length).toBeGreaterThan(
        roles.filter((role) => role === 'accent').length,
      );
    }
    // Every lot of a row is as deep as its deepest, so the rows stay in line.
    expect(new Set(block.lots.map((lot) => lot.depth))).toEqual(new Set([4]));
  });

  it('keeps a row of one for a house, and gives a row of two one accent', () => {
    const pair = housingBlock(rect(0, 0, 11, 8), HOUSE, 1, {
      accent: { footprint: { x: 4, z: 4 }, share: 0.1 },
    })!;
    for (const z of new Set(pair.lots.map((lot) => lot.tileZ))) {
      expect(pair.lots.filter((lot) => lot.tileZ === z).map((lot) => lot.role)).toEqual([
        'accent',
        'house',
      ]);
    }
    const block = housingBlock(rect(0, 0, 5, 8), HOUSE, 1, {
      accent: { footprint: { x: 4, z: 4 }, share: 0.3 },
      shops: true,
    })!;
    expect(new Set(block.lots.map((lot) => lot.role))).toEqual(new Set(['house']));
  });

  it('keeps the ends of each lane for a shop, facing the lane', () => {
    const block = housingBlock(rect(0, 0, 18, 17), HOUSE, 1, { shops: true })!;
    const shops = block.lots.filter((lot) => lot.role === 'shop');
    expect(shops).toHaveLength(2);
    const columns = columnsOf(block);
    const [west, east] = shops.toSorted((a, b) => a.tileX - b.tileX);
    expect(west).toMatchObject({ tileX: columns[0], rotation: 0 });
    expect(east).toMatchObject({ tileX: columns.at(-1), rotation: 2 });
    const lane = block.lanes[0]!;
    expect(west!.tileZ + west!.depth).toBeLessThan(lane);
    expect(east!.tileZ).toBeGreaterThan(lane);
  });

  it('stands a smaller object at the front of its lot, centred across it', () => {
    const lot = { tileX: 10, tileZ: 20, width: 4, depth: 4, role: 'accent' as const };
    expect(lotAnchor({ ...lot, rotation: 0 }, HOUSE)).toEqual({ tileX: 10, tileZ: 21 });
    expect(lotAnchor({ ...lot, rotation: 2 }, { x: 2, z: 2 })).toEqual({ tileX: 11, tileZ: 20 });
  });

  it('gives up on a district too small for one house', () => {
    expect(housingBlock(rect(0, 0, 4, 10), HOUSE, 1)).toBeNull();
    expect(housingBlock(rect(0, 0, 10, 4), HOUSE, 1)).toBeNull();
  });
});

describe('parkLayout', () => {
  it('gives up on a district too small for a park', () => {
    expect(parkLayout(rect(0, 0, PARK_MIN.width - 1, 20))).toBeNull();
    expect(parkLayout(rect(0, 0, 20, PARK_MIN.depth - 1))).toBeNull();
  });

  it('digs a pond two rows deep and crosses it with the middle path', () => {
    const park = parkLayout(rect(0, 0, 21, 14))!;
    const rows = new Set(park.water.map((tile) => tile.z));
    expect(rows.size).toBe(2);
    const crossing = park.runs.find((run) => run.from.x === run.to.x && run.from.z === -1)!;
    expect(crossing.to.z).toBe(14);
    expect(park.water.some((tile) => tile.x === crossing.from.x)).toBe(true);
  });

  it('keeps every tree inside the park and clear of the water and its paths', () => {
    const area = rect(4, 6, 23, 19);
    const park = parkLayout(area)!;
    const paths = park.runs.flatMap((run) => {
      const tiles = [];
      for (let x = Math.min(run.from.x, run.to.x); x <= Math.max(run.from.x, run.to.x); x++) {
        for (let z = Math.min(run.from.z, run.to.z); z <= Math.max(run.from.z, run.to.z); z++) {
          tiles.push({ x, z });
        }
      }
      return tiles;
    });
    expect(park.trees.length).toBeGreaterThan(4);
    for (const { tile } of park.trees) {
      expect(tile.x).toBeGreaterThanOrEqual(area.x0);
      expect(tile.x).toBeLessThanOrEqual(area.x1);
      expect(tile.z).toBeGreaterThanOrEqual(area.z0);
      expect(tile.z).toBeLessThanOrEqual(area.z1);
      const near = [...paths, ...park.water].some(
        (other) => Math.max(Math.abs(other.x - tile.x), Math.abs(other.z - tile.z)) < 2,
      );
      expect({ tile, near }).toEqual({ tile, near: false });
    }
  });

  it('runs a walk along each bank from street to street, and fits the smallest district', () => {
    const area = rect(0, 0, PARK_MIN.width, PARK_MIN.depth);
    const park = parkLayout(area)!;
    const pondRows = [...new Set(park.water.map((tile) => tile.z))].toSorted((a, b) => a - b);
    const walks = park.runs.filter((run) => run.from.z === run.to.z);
    expect(walks.map((walk) => walk.from.z)).toEqual([pondRows[0]! - 1, pondRows[1]! + 1]);
    for (const walk of walks) expect([walk.from.x, walk.to.x]).toEqual([area.x0 - 1, area.x1 + 1]);
    expect(park.beds).toHaveLength(4);
    expect(park.trees.length).toBeGreaterThan(0);
  });

  it('plants the lawns as a mirror image about the middle path', () => {
    const park = parkLayout(rect(0, 0, 25, 16))!;
    const middle = park.axis;
    const at = new Map(park.trees.map((tree) => [`${tree.tile.x},${tree.tile.z}`, tree.species]));
    for (const tree of park.trees) {
      expect(at.get(`${2 * middle - tree.tile.x},${tree.tile.z}`)).toBe(tree.species);
    }
  });
});

/** Every paved tile of a park: its runs and its plaza. */
const pavedOf = (park: ParkLayout) =>
  new Set(
    [...park.runs.flatMap(runTiles), ...(park.plaza ? rectTiles(park.plaza) : [])].map((tile) =>
      tileKey(tile.x, tile.z),
    ),
  );

const inPlaza = (plaza: TileRect, tile: { x: number; z: number }) =>
  tile.x >= plaza.x0 && tile.x <= plaza.x1 && tile.z >= plaza.z0 && tile.z <= plaza.z1;

const keysOf = (tiles: readonly { x: number; z: number }[]) =>
  new Set(tiles.map((tile) => tileKey(tile.x, tile.z)));

/** What each run crosses on its way: `W` for water and `-` for land, in order. */
const crossingOf = (park: ParkLayout, run: ParkLayout['runs'][number]) => {
  const water = keysOf(park.water);
  return runTiles(run)
    .map((tile) => (water.has(tileKey(tile.x, tile.z)) ? 'W' : '-'))
    .join('');
};

describe('park designs', () => {
  const ROOMY = rect(4, 6, 27, 20);
  const WOBBLE = { lobes: 0.12, lean: -0.08 };

  it('offers only the plainest designs to a small district', () => {
    expect(parkDesignsFor(rect(0, 0, 11, 8))).toEqual(['canal']);
    expect(parkDesignsFor(ROOMY)).toEqual([...PARK_DESIGNS]);
  });

  it('refuses a design the district is too small for', () => {
    expect(parkLayout(rect(0, 0, 13, 10), { design: 'isle' })).toBeNull();
  });

  for (const design of PARK_DESIGNS) {
    describe(design, () => {
      const park = parkLayout(ROOMY, { design, wobble: WOBBLE, margin: 1 })!;

      it('keeps everything it stands inside the district, on lawn, apart', () => {
        const paved = pavedOf(park);
        const taken = new Map<string, string>();
        const claim = (tiles: readonly { x: number; z: number }[], what: string) => {
          for (const tile of tiles) {
            const key = tileKey(tile.x, tile.z);
            expect({
              key,
              what,
              inside:
                tile.x >= ROOMY.x0 &&
                tile.x <= ROOMY.x1 &&
                tile.z >= ROOMY.z0 &&
                tile.z <= ROOMY.z1,
            }).toMatchObject({ inside: true });
            expect({
              key,
              what,
              clash: taken.get(key) ?? (paved.has(key) ? 'path' : null),
            }).toEqual({ key, what, clash: null });
            taken.set(key, what);
          }
        };
        // Water may lie under a path, which is a bridge; nothing else may.
        for (const tile of park.water) taken.set(tileKey(tile.x, tile.z), 'water');
        claim(
          park.trees.map((tree) => tree.tile),
          'tree',
        );
        claim(
          park.beds.filter((bed) => !(park.plaza && inPlaza(park.plaza, bed))),
          'bed',
        );
        claim(park.tables.flatMap(tableTiles), 'table');
      });

      it('runs every path from a street or onto another path', () => {
        const street = (tile: { x: number; z: number }) =>
          tile.x === ROOMY.x0 - 1 ||
          tile.x === ROOMY.x1 + 1 ||
          tile.z === ROOMY.z0 - 1 ||
          tile.z === ROOMY.z1 + 1;
        const plaza = park.plaza ? keysOf(rectTiles(park.plaza)) : new Set<string>();
        for (const [index, run] of park.runs.entries()) {
          const others = keysOf(park.runs.filter((_, other) => other !== index).flatMap(runTiles));
          const joined = runTiles(run).some((tile) => {
            if (street(tile)) return true;
            return [
              [0, 1],
              [0, -1],
              [1, 0],
              [-1, 0],
              [0, 0],
            ].some(([dx, dz]) => {
              const key = tileKey(tile.x + dx!, tile.z + dz!);
              return others.has(key) || plaza.has(key);
            });
          });
          expect({ run, joined }).toEqual({ run, joined: true });
        }
      });

      it('crosses water only head on, with land at both ends of every crossing', () => {
        for (const run of park.runs) {
          const crossing = crossingOf(park, run);
          expect({ run, crossing, ends: /^-.*-$|^-+$/.test(crossing) }).toMatchObject({
            ends: true,
          });
          // A bridge is at least a ramp off each bank.
          expect({ run, crossing, short: /-W-/.test(crossing) }).toMatchObject({ short: false });
        }
      });

      it('plants trees on a grid mirrored about the axis', () => {
        const at = new Map(
          park.trees.map((tree) => [tileKey(tree.tile.x, tree.tile.z), tree.species]),
        );
        for (const tree of park.trees) {
          expect(at.get(tileKey(2 * park.axis - tree.tile.x, tree.tile.z))).toBe(tree.species);
        }
      });

      it('stands its picnic tables along a path', () => {
        expect(park.tables.length).toBeGreaterThan(0);
        const paved = pavedOf(park);
        for (const table of park.tables) {
          const sides =
            table.rotation === 0
              ? [
                  [0, -1],
                  [0, 1],
                ]
              : [
                  [-1, 0],
                  [1, 0],
                ];
          const along = sides.some(([dx, dz]) =>
            tableTiles(table).every((tile) => paved.has(tileKey(tile.x + dx!, tile.z + dz!))),
          );
          expect({ table, along }).toEqual({ table, along: true });
        }
      });
    });
  }

  it('digs two separate ponds either side of the middle for twin', () => {
    const park = parkLayout(ROOMY, { design: 'twin' })!;
    const west = park.water.filter((tile) => tile.x < park.axis);
    const east = park.water.filter((tile) => tile.x > park.axis);
    expect(west.length).toBeGreaterThan(4);
    expect(east.length).toBe(west.length);
    expect(park.water.some((tile) => tile.x === park.axis)).toBe(false);
    const across = park.runs
      .filter((run) => run.from.z === run.to.z)
      .map((run) => crossingOf(park, run));
    expect(across.some((crossing) => crossing.match(/W+/g)?.length === 2)).toBe(true);
  });

  it('lays a bridge long enough for a deck across a lake', () => {
    const park = parkLayout(ROOMY, { design: 'lake' })!;
    const down = park.runs.find((run) => run.from.x === park.axis && run.from.z === ROOMY.z0 - 1)!;
    const longest = Math.max(
      ...(crossingOf(park, down).match(/W+/g) ?? ['']).map((run) => run.length),
    );
    expect(longest).toBeGreaterThanOrEqual(3);
  });

  it('lands the bridge on an island halfway across for isle', () => {
    const park = parkLayout(ROOMY, { design: 'isle' })!;
    const down = park.runs.find((run) => run.from.x === park.axis && run.from.z === ROOMY.z0 - 1)!;
    expect(crossingOf(park, down)).toMatch(/-WW+-+WW+-/);
  });

  it('stands a two-by-two centrepiece in the middle of the plaza', () => {
    const park = parkLayout(ROOMY, { design: 'plaza' })!;
    const plaza = park.plaza!;
    const { x, z } = park.centrepiece!;
    expect(x - plaza.x0).toBe(plaza.x1 - (x + 1));
    expect(z - plaza.z0).toBe(plaza.z1 - (z + 1));
    // Paths in from the south corners that step rather than run straight.
    const stepped = park.runs.filter((run) => run.from.z !== run.to.z && run.from.x !== park.axis);
    expect(stepped.length).toBeGreaterThanOrEqual(2);
  });

  it('makes a smaller lake for a wider margin, and keeps the design when the margin will not fit', () => {
    const tight = parkLayout(ROOMY, { design: 'lake', margin: 0 })!;
    const roomy = parkLayout(ROOMY, { design: 'lake', margin: 2 })!;
    expect(roomy.water.length).toBeLessThan(tight.water.length);
    expect(parkLayout(rect(0, 0, 15, 12), { design: 'lake', margin: 5 })?.design).toBe('lake');
  });
});
