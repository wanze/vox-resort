import { describe, expect, it } from 'vitest';
import { tileKey } from './resortLayout';
import {
  blobTiles,
  mirrorRun,
  NO_WOBBLE,
  plantGrid,
  rectTiles,
  runTiles,
  tableSpots,
  tableTiles,
  WOBBLE_LIMIT,
  type TileRect,
} from './parkShapes';

const keysOf = (tiles: readonly { x: number; z: number }[]) =>
  new Set(tiles.map((tile) => tileKey(tile.x, tile.z)));

describe('blobTiles', () => {
  const box: TileRect = { x0: 2, x1: 12, z0: 4, z1: 11 };

  it('fills an ellipse inside its box', () => {
    const pond = blobTiles(box, NO_WOBBLE);
    expect(pond.length).toBeGreaterThan(40);
    expect(pond.length).toBeLessThan(rectTiles(box).length);
    for (const tile of pond) {
      expect(tile.x >= box.x0 && tile.x <= box.x1 && tile.z >= box.z0 && tile.z <= box.z1).toBe(
        true,
      );
    }
  });

  it('is a mirror image of itself about the box middle, however it wobbles', () => {
    for (const wobble of [NO_WOBBLE, { lobes: 0.12, lean: -0.1 }, { lobes: -0.15, lean: 0.15 }]) {
      const pond = keysOf(blobTiles(box, wobble));
      for (const key of pond) {
        const [x, z] = key.split(',').map(Number);
        expect(pond.has(tileKey(box.x0 + box.x1 - x!, z!))).toBe(true);
      }
    }
  });

  it('comes out a different shape for a different wobble', () => {
    const plain = keysOf(blobTiles(box, NO_WOBBLE));
    const lobed = keysOf(blobTiles(box, { lobes: WOBBLE_LIMIT, lean: WOBBLE_LIMIT }));
    expect([...lobed].toSorted()).not.toEqual([...plain].toSorted());
  });

  it('is crossed by one unbroken run of water along its middle column', () => {
    for (const lean of [-WOBBLE_LIMIT, 0, WOBBLE_LIMIT]) {
      const rows = blobTiles({ ...box, x1: 12 }, { lobes: -WOBBLE_LIMIT, lean })
        .filter((tile) => tile.x === 7)
        .map((tile) => tile.z)
        .toSorted((a, b) => a - b);
      expect(rows.at(-1)! - rows[0]! + 1).toBe(rows.length);
    }
  });
});

describe('runs', () => {
  it('covers a straight run end to end, whichever way it was drawn', () => {
    expect(runTiles({ from: { x: 3, z: 1 }, to: { x: 1, z: 1 } })).toEqual([
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 3, z: 1 },
    ]);
  });

  it('reflects a run about a column', () => {
    expect(mirrorRun({ from: { x: 1, z: 2 }, to: { x: 3, z: 2 } }, 5)).toEqual({
      from: { x: 9, z: 2 },
      to: { x: 7, z: 2 },
    });
  });
});

describe('plantGrid', () => {
  const rect: TileRect = { x0: 0, x1: 20, z0: 0, z1: 14 };

  it('plants a symmetric grid clear of what is blocked', () => {
    const blocked = keysOf([{ x: 4, z: 7 }, ...rectTiles({ x0: 10, x1: 10, z0: 0, z1: 14 })]);
    const trees = plantGrid({ rect, axis: 10, anchorZ: 7, blocked });
    expect(trees.length).toBeGreaterThan(6);
    const at = new Map(trees.map((tree) => [tileKey(tree.tile.x, tree.tile.z), tree.species]));
    for (const { tile, species } of trees) {
      expect(at.get(tileKey(20 - tile.x, tile.z))).toBe(species);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          expect(blocked.has(tileKey(tile.x + dx, tile.z + dz))).toBe(false);
        }
      }
    }
    expect(at.has(tileKey(16, 7))).toBe(false);
  });
});

describe('tableSpots', () => {
  const rect: TileRect = { x0: 0, x1: 20, z0: 0, z1: 10 };
  const walk = rectTiles({ x0: 0, x1: 20, z0: 5, z1: 5 });

  it('stands tables in mirrored pairs along a path, off it and out of the water', () => {
    const water = keysOf(rectTiles({ x0: 0, x1: 20, z0: 6, z1: 10 }));
    const tables = tableSpots({ rect, axis: 10, paved: keysOf(walk), water, taken: new Set() });
    expect(tables.length).toBe(4);
    const spots = keysOf(tables.map((table) => table.tile));
    for (const { tile, rotation } of tables) {
      expect(rotation).toBe(0);
      expect(spots.has(tileKey(19 - tile.x, tile.z))).toBe(true);
      expect(tile.z).toBe(4);
    }
  });

  it('turns a table beside a path that runs north to south', () => {
    const lane = keysOf([
      ...rectTiles({ x0: 5, x1: 5, z0: 0, z1: 10 }),
      ...rectTiles({ x0: 15, x1: 15, z0: 0, z1: 10 }),
    ]);
    const tables = tableSpots({ rect, axis: 10, paved: lane, water: new Set(), taken: new Set() });
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table.rotation).toBe(1);
      expect(tableTiles(table).every((tile) => tile.x === 4 || tile.x === 6 || tile.x > 10)).toBe(
        true,
      );
    }
  });

  it('finds none where nothing runs alongside the lawn', () => {
    expect(
      tableSpots({ rect, axis: 10, paved: new Set(), water: new Set(), taken: new Set() }),
    ).toEqual([]);
  });
});
