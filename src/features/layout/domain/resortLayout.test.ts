import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import {
  decorationsFor,
  derivedKey,
  isPathNetworkConnected,
  layoutResort,
  occupiedTiles,
  pathTilesFor,
  place,
  placementCenter,
  plotKeys,
  plotsWithoutPathAccess,
  routeEdgeTiles,
  streetTiles,
  widthOffsets,
  type LayoutItem,
  type ResortLayout,
} from './resortLayout';
import {
  BOARDWALK_ID,
  DERIVED_IDS,
  HEDGE_ID,
  LAMP_ID,
  PATH_ID,
  RESORT_PLAN,
  type ResortPlan,
} from './resortPlan';
import { shoreFor, terrainAt, waterStartZ } from './shoreline';
import { elevationFor, levelAt, levelHeight } from './elevation';

/** An item that exactly fills the tiles it claims. */
const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * TILE_VOXELS,
  depth: tilesZ * TILE_VOXELS,
});

/** A tiny plan: one 2x2 hut on a 4x4 plot, ringed by streets. */
const tinyItems: LayoutItem[] = [item(PATH_ID), item('hut', 2, 2)];
const tinyPlan: ResortPlan = {
  tilesX: 4,
  tilesZ: 4,
  plots: [{ id: 'hut', tileX: 1, tileZ: 1 }],
  nodes: [
    { id: 'nw', tileX: 0, tileZ: 0 },
    { id: 'ne', tileX: 3, tileZ: 0 },
    { id: 'sw', tileX: 0, tileZ: 3 },
    { id: 'se', tileX: 3, tileZ: 3 },
  ],
  edges: [
    { from: 'nw', to: 'ne' },
    { from: 'sw', to: 'se' },
    { from: 'nw', to: 'sw' },
    { from: 'ne', to: 'se' },
  ],
  plazas: [],
};

const node = (id: string, tileX: number, tileZ: number) => ({ id, tileX, tileZ });

describe('widthOffsets', () => {
  it('keeps a one-tile street on its centre line', () => {
    expect(widthOffsets(1)).toEqual([0]);
  });

  it('grows an even width towards the low side', () => {
    expect(widthOffsets(2)).toEqual([-1, 0]);
    expect(widthOffsets(4)).toEqual([-2, -1, 0, 1]);
  });

  it('grows an odd width symmetrically', () => {
    expect(widthOffsets(3)).toEqual([-1, 0, 1]);
  });

  it('rejects a street with no width', () => {
    expect(() => widthOffsets(0)).toThrow(/cannot be/);
  });
});

describe('routeEdgeTiles', () => {
  it('runs straight along one axis', () => {
    const tiles = routeEdgeTiles(node('a', 2, 5), node('b', 5, 5));
    expect(tiles.map((tile) => tile.x).toSorted()).toEqual([2, 3, 4, 5]);
    expect(tiles.every((tile) => tile.z === 5)).toBe(true);
  });

  it('turns as an L, taking the x leg first by default', () => {
    const tiles = new Set(
      routeEdgeTiles(node('a', 0, 0), node('b', 2, 2)).map((t) => `${t.x},${t.z}`),
    );
    expect(tiles.has('1,0')).toBe(true); // along x at the start z
    expect(tiles.has('2,1')).toBe(true); // then down z at the end x
    expect(tiles.has('0,1')).toBe(false);
  });

  it('takes the z leg first when asked', () => {
    const tiles = new Set(
      routeEdgeTiles(node('a', 0, 0), node('b', 2, 2), 1, 'z-first').map((t) => `${t.x},${t.z}`),
    );
    expect(tiles.has('0,1')).toBe(true);
    expect(tiles.has('1,0')).toBe(false);
  });

  it('squares the corner off so a wide street does not pinch', () => {
    const tiles = new Set(
      routeEdgeTiles(node('a', 0, 0), node('b', 4, 4), 2).map((t) => `${t.x},${t.z}`),
    );
    // Both legs are two wide, and the corner carries the full width.
    expect(tiles.has('3,-1')).toBe(true);
    expect(tiles.has('4,-1')).toBe(true);
    expect(tiles.has('3,0')).toBe(true);
    expect(tiles.has('4,0')).toBe(true);
  });
});

describe('streetTiles', () => {
  it('paves the whole ring the tiny plan describes', () => {
    expect(streetTiles(tinyPlan)).toHaveLength(12);
  });

  it('paves a plaza wholesale', () => {
    const withPlaza: ResortPlan = { ...tinyPlan, plazas: [{ x0: 1, x1: 2, z0: 1, z1: 2 }] };
    expect(streetTiles(withPlaza)).toHaveLength(16);
  });

  it('rejects a street that leaves the plot', () => {
    const plan: ResortPlan = {
      ...tinyPlan,
      nodes: [...tinyPlan.nodes, { id: 'far', tileX: 9, tileZ: 0 }],
      edges: [{ from: 'nw', to: 'far' }],
    };
    expect(() => streetTiles(plan)).toThrow(/leaves the plot/);
  });

  it('rejects an edge naming a node the plan never placed', () => {
    const plan: ResortPlan = { ...tinyPlan, edges: [{ from: 'nw', to: 'nowhere' }] };
    expect(() => streetTiles(plan)).toThrow(/unknown node/);
  });
});

describe('plotKeys', () => {
  it('leaves a type placed once with its bare id', () => {
    expect(plotKeys([{ id: 'hut', tileX: 0, tileZ: 0 }])).toEqual(['hut']);
  });

  it('numbers the repeats of a type', () => {
    expect(
      plotKeys([
        { id: 'hut', tileX: 0, tileZ: 0 },
        { id: 'shed', tileX: 1, tileZ: 0 },
        { id: 'hut', tileX: 2, tileZ: 0 },
      ]),
    ).toEqual(['hut', 'shed', 'hut#2']);
  });
});

describe('derivedKey', () => {
  it('names a derived placement after the tile it stands on', () => {
    expect(derivedKey(PATH_ID, 12, 7)).toBe(`${PATH_ID}@12,7`);
  });

  it('separates tiles that differ on either axis', () => {
    expect(derivedKey(PATH_ID, 1, 2)).not.toBe(derivedKey(PATH_ID, 2, 1));
  });

  it('gives two types on the same tile different keys', () => {
    expect(derivedKey(LAMP_ID, 3, 3)).not.toBe(derivedKey(HEDGE_ID, 3, 3));
  });
});

describe('place', () => {
  it('anchors a full-footprint model on its tile', () => {
    const placement = place(item('hut', 2, 2), 'hut', 3, 4);
    expect(placement).toMatchObject({ key: 'hut', id: 'hut', tileX: 3, tileZ: 4 });
    expect([placement.x, placement.z]).toEqual([3 * TILE_VOXELS, 4 * TILE_VOXELS]);
  });

  it('centres a model smaller than the footprint it claims', () => {
    const narrow: LayoutItem = { id: 'post', tilesX: 2, tilesZ: 2, width: 4, depth: 4 };
    const placement = place(narrow, 'post', 1, 1);
    expect(placement.x).toBe(TILE_VOXELS + Math.floor((2 * TILE_VOXELS - 4) / 2));
    expect(placement.z).toBe(placement.x);
  });

  it('stands an object unturned when nobody said otherwise', () => {
    expect(place(item('hut', 2, 3), 'hut', 0, 0).rotation).toBe(0);
  });

  it('swaps the footprint and the extent a quarter turn swaps', () => {
    const cottage: LayoutItem = { id: 'cottage', tilesX: 2, tilesZ: 3, width: 30, depth: 44 };
    expect(place(cottage, 'cottage', 4, 5, 1)).toMatchObject({
      tileX: 4,
      tileZ: 5,
      tilesX: 3,
      tilesZ: 2,
      rotation: 1,
      width: 44,
      depth: 30,
    });
  });

  it('still anchors a turned object on the tile it was placed on', () => {
    // The turn is about the object, not about the plot: whichever way it faces,
    // its footprint starts on the same north-west tile.
    const cottage: LayoutItem = { id: 'cottage', tilesX: 2, tilesZ: 3, width: 32, depth: 48 };
    for (const rotation of [0, 1, 2, 3] as const) {
      const placement = place(cottage, 'cottage', 4, 5, rotation);
      expect({ rotation, x: placement.x, z: placement.z }).toEqual({
        rotation,
        x: 4 * TILE_VOXELS,
        z: 5 * TILE_VOXELS,
      });
    }
  });

  it('centres a turned model in the footprint it now claims', () => {
    const narrow: LayoutItem = { id: 'post', tilesX: 1, tilesZ: 2, width: 4, depth: 20 };
    const placement = place(narrow, 'post', 0, 0, 1);
    expect(placement).toMatchObject({ tilesX: 2, tilesZ: 1, width: 20, depth: 4 });
    expect(placement.x).toBe(Math.floor((2 * TILE_VOXELS - 20) / 2));
    expect(placement.z).toBe(Math.floor((TILE_VOXELS - 4) / 2));
  });

  it('stands an object at sea level when nobody said otherwise', () => {
    expect(place(item('hut', 2, 2), 'hut', 3, 4).y).toBe(0);
  });

  it('stands an object on the terrace it was given', () => {
    expect(place(item('hut'), 'hut', 0, 0, 0, 1).y).toBe(LEVEL_VOXELS);
    expect(place(item('hut'), 'hut', 0, 0, 0, 3).y).toBe(3 * LEVEL_VOXELS);
  });

  it('does not centre the height the way it centres the corner', () => {
    // A model narrower than its footprint is centred in it; a model shorter than
    // a storey still sits on the ground rather than floating in the middle of it.
    const narrow: LayoutItem = { id: 'post', tilesX: 2, tilesZ: 2, width: 4, depth: 4 };
    expect(place(narrow, 'post', 0, 0, 0, 2).y).toBe(2 * LEVEL_VOXELS);
  });
});

describe('a terraced plot', () => {
  /**
   * The tiny plan cut into two benches, with the step on its southern street:
   * the hut and the northern street stand a level up, the southern street below.
   *
   * The step has to fall on a street rather than through the middle of the plot,
   * because a hut laid across it is exactly what `layoutResort` now refuses —
   * see the last case in this block.
   */
  const terraced: ResortPlan = {
    ...tinyPlan,
    elevation: { terraces: [{ level: 1, inset: 0, wave: 0 }], seed: 1 },
  };

  it('stands each object on the terrace its own tile is on', () => {
    const { placements } = layoutResort(tinyItems, terraced);
    expect(placements[0]).toMatchObject({ id: 'hut', tileZ: 1, y: LEVEL_VOXELS });
  });

  it('lays every paved tile at the height of the ground under it', () => {
    const elevation = elevationFor(terraced)!;
    const { paths } = layoutResort(tinyItems, terraced);
    expect(paths.length).toBeGreaterThan(0);
    for (const tile of paths) {
      expect({ z: tile.tileZ, y: tile.y }).toEqual({
        z: tile.tileZ,
        y: levelHeight(levelAt(elevation, tile.tileX, tile.tileZ)),
      });
    }
  });

  it('leaves a flat plot at sea level throughout', () => {
    const { placements, paths } = layoutResort(tinyItems, tinyPlan);
    for (const placement of [...placements, ...paths]) expect(placement.y).toBe(0);
  });

  it('draws both benches, so a terrace is something you can see', () => {
    const { paths } = layoutResort(tinyItems, terraced);
    expect(new Set(paths.map((tile) => tile.y))).toEqual(new Set([0, LEVEL_VOXELS]));
  });

  it('refuses a plot laid across a step, naming the tile that straddles it', () => {
    // A model is a box with a flat underside: across a step one end hangs in the
    // air and the other is buried, and no height for it would be right.
    const across: ResortPlan = {
      ...tinyPlan,
      elevation: { terraces: [{ level: 1, inset: 1, wave: 0 }], seed: 1 },
    };
    expect(() => layoutResort(tinyItems, across)).toThrow(/"hut" straddles a step at tile 1,2/);
  });

  it('accepts a one-tile object either side of a step', () => {
    // The rule is about a footprint, not about being near a step: a path tile
    // stands on whichever bench it is on, and there are plenty on both.
    const { paths } = layoutResort(tinyItems, terraced);
    expect(paths.filter((tile) => tile.y === 0).length).toBeGreaterThan(0);
    expect(paths.filter((tile) => tile.y === LEVEL_VOXELS).length).toBeGreaterThan(0);
  });
});

describe('layoutResort', () => {
  it('places each plot on its tile boundary', () => {
    const { placements } = layoutResort(tinyItems, tinyPlan);
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({
      key: 'hut',
      id: 'hut',
      tileX: 1,
      tileZ: 1,
      x: TILE_VOXELS,
      z: TILE_VOXELS,
    });
  });

  it('centres a model that does not fill its footprint', () => {
    const narrow: LayoutItem = { id: 'hut', tilesX: 2, tilesZ: 2, width: 20, depth: 32 };
    const { placements } = layoutResort([item(PATH_ID), narrow], tinyPlan);
    expect(placements[0]?.x).toBe(TILE_VOXELS + 6); // (32 - 20) / 2
    expect(placements[0]?.z).toBe(TILE_VOXELS);
  });

  it('paves every street tile no object stands on', () => {
    const { paths } = layoutResort(tinyItems, tinyPlan);
    expect(paths).toHaveLength(12); // the 4x4 ring
    expect(paths.every((placement) => placement.id === PATH_ID)).toBe(true);
    expect(paths.some((placement) => placement.tileX === 1 && placement.tileZ === 1)).toBe(false);
  });

  it('gives every placement a unique key', () => {
    const plan: ResortPlan = {
      ...tinyPlan,
      tilesX: 6,
      tilesZ: 6,
      plots: [
        { id: 'hut', tileX: 1, tileZ: 1 },
        { id: 'hut', tileX: 3, tileZ: 3 },
      ],
      nodes: [
        { id: 'nw', tileX: 0, tileZ: 0 },
        { id: 'ne', tileX: 5, tileZ: 0 },
        { id: 'sw', tileX: 0, tileZ: 5 },
        { id: 'se', tileX: 5, tileZ: 5 },
      ],
    };
    const layout = layoutResort(tinyItems, plan);
    const keys = [...layout.placements, ...layout.props, ...layout.paths].map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(layout.placements.map((p) => p.key)).toEqual(['hut', 'hut#2']);
  });

  it('leaves a street tile unpaved where an object stands on it', () => {
    const plan: ResortPlan = { ...tinyPlan, plots: [{ id: 'hut', tileX: 0, tileZ: 0 }] };
    const paved = pathTilesFor(tinyItems, plan);
    expect(paved.some((tile) => tile.x < 2 && tile.z < 2)).toBe(false);
    expect(paved).toHaveLength(9); // the 12-tile ring, less the 3 the hut covers
  });

  it('rejects two objects on the same tile', () => {
    const plan: ResortPlan = {
      ...tinyPlan,
      plots: [
        { id: 'hut', tileX: 1, tileZ: 1 },
        { id: 'shed', tileX: 2, tileZ: 2 },
      ],
    };
    expect(() => occupiedTiles([...tinyItems, item('shed', 2, 2)], plan)).toThrow(/overlaps/);
  });

  it('rejects an object hanging off the plot', () => {
    const plan: ResortPlan = { ...tinyPlan, plots: [{ id: 'hut', tileX: 3, tileZ: 1 }] };
    expect(() => occupiedTiles(tinyItems, plan)).toThrow(/does not fit/);
  });

  it('rejects a model larger than the tiles it claims', () => {
    const fat: LayoutItem = { id: 'hut', tilesX: 2, tilesZ: 2, width: 40, depth: 32 };
    expect(() => occupiedTiles([item(PATH_ID), fat], tinyPlan)).toThrow(/larger than/);
  });

  it('rejects an object the plan never places', () => {
    expect(() => layoutResort([...tinyItems, item('shed')], tinyPlan)).toThrow(/no plot/);
  });

  it('does not require a plot for the objects it scatters itself', () => {
    const items = [...tinyItems, item(LAMP_ID), item(HEDGE_ID)];
    expect(() => layoutResort(items, tinyPlan)).not.toThrow();
  });

  it('rejects a catalogue with nothing to pave with', () => {
    expect(() => layoutResort([item('hut', 2, 2)], tinyPlan)).toThrow(/pave with/);
  });
});

/** Every key the layout gave itself rather than taking from the plan. */
const derived = (layout: ResortLayout): Set<string> =>
  new Set([...layout.paths, ...layout.props].map((placement) => placement.key));

describe('derived keys under an edit', () => {
  const items: LayoutItem[] = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
  }));
  /** The real plan, plus one more cottage on a free tile in the north-west. */
  const edited: ResortPlan = {
    ...RESORT_PLAN,
    plots: [...RESORT_PLAN.plots, { id: 'cottage', tileX: 5, tileZ: 5 }],
  };

  it('keys every derived placement on the tile it stands on', () => {
    const layout = layoutResort(items, RESORT_PLAN);
    for (const placement of [...layout.paths, ...layout.props]) {
      expect(placement.key).toBe(derivedKey(placement.id, placement.tileX, placement.tileZ));
    }
  });

  it('renames only what an edit actually moved', () => {
    const before = layoutResort(items, RESORT_PLAN);
    const after = layoutResort(items, edited);
    const was = derived(before);
    const now = derived(after);
    const added = [...now].filter((key) => !was.has(key));
    const removed = [...was].filter((key) => !now.has(key));

    // One cottage costs one spur tile out of three and a half thousand derived
    // placements. Numbered by array index, the same edit renamed every path
    // tile after the insertion and no diff against the live scene meant
    // anything.
    expect(was.size).toBeGreaterThan(3000);
    expect(added).toHaveLength(1);
    expect(removed).toEqual([]);
  });
});

describe('spurs', () => {
  /** A 7x7 plot with one street across the top and a hut two rows below it. */
  const plan: ResortPlan = {
    tilesX: 7,
    tilesZ: 7,
    plots: [{ id: 'hut', tileX: 2, tileZ: 3 }],
    nodes: [
      { id: 'w', tileX: 0, tileZ: 0 },
      { id: 'e', tileX: 6, tileZ: 0 },
    ],
    edges: [{ from: 'w', to: 'e' }],
    plazas: [],
  };

  it('grows the shortest path from an object to the network', () => {
    const paved = pathTilesFor([item(PATH_ID), item('hut', 2, 2)], plan);
    const spur = paved.filter((tile) => tile.z > 0);
    // Two tiles: the hut's border row at z = 2, then z = 1 to reach the street.
    expect(spur).toHaveLength(2);
    expect(spur.every((tile) => tile.x === 2 || tile.x === 3)).toBe(true);
    expect(isPathNetworkConnected(paved)).toBe(true);
  });

  it('grows nothing when a street already touches the object', () => {
    const touching: ResortPlan = { ...plan, plots: [{ id: 'hut', tileX: 2, tileZ: 1 }] };
    expect(pathTilesFor([item(PATH_ID), item('hut', 2, 2)], touching)).toHaveLength(7);
  });

  it('reports an object it cannot reach', () => {
    // Four sheds box the hut in on every side; nothing is left to route through.
    const walled: ResortPlan = {
      tilesX: 3,
      tilesZ: 3,
      plots: [
        { id: 'hut', tileX: 1, tileZ: 1 },
        { id: 'shed', tileX: 1, tileZ: 0 },
        { id: 'shed', tileX: 0, tileZ: 1 },
        { id: 'shed', tileX: 2, tileZ: 1 },
        { id: 'shed', tileX: 1, tileZ: 2 },
      ],
      nodes: [],
      edges: [],
      plazas: [{ x0: 0, x1: 0, z0: 0, z1: 0 }],
    };
    expect(() => pathTilesFor([item(PATH_ID), item('hut'), item('shed')], walled)).toThrow(
      /cannot be reached/,
    );
  });
});

describe('decorationsFor', () => {
  const items = [item(PATH_ID), item('hut', 2, 2), item(LAMP_ID), item(HEDGE_ID)];

  it('never puts a lamp or a hedge on a paved or occupied tile', () => {
    const { lamps, hedges } = decorationsFor(items, tinyPlan);
    const paved = new Set(pathTilesFor(items, tinyPlan).map((tile) => `${tile.x},${tile.z}`));
    const occupied = new Set(occupiedTiles(items, tinyPlan).keys());
    for (const tile of [...lamps, ...hedges]) {
      expect(paved.has(`${tile.x},${tile.z}`)).toBe(false);
      expect(occupied.has(`${tile.x},${tile.z}`)).toBe(false);
    }
  });

  it('keeps lamps at least the spacing apart', () => {
    const { lamps } = decorationsFor(
      OBJECT_TYPES.map((type) => ({
        id: type.id,
        tilesX: type.model.tiles.x,
        tilesZ: type.model.tiles.z,
        width: type.model.width,
        depth: type.model.depth,
      })),
      RESORT_PLAN,
      6,
    );
    expect(lamps.length).toBeGreaterThan(10);
    for (const a of lamps) {
      for (const b of lamps) {
        if (a === b) continue;
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThanOrEqual(6);
      }
    }
  });
});

describe('isPathNetworkConnected', () => {
  it('accepts an empty network', () => {
    expect(isPathNetworkConnected([])).toBe(true);
  });

  it('accepts a run of touching tiles', () => {
    expect(
      isPathNetworkConnected([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 1 },
      ]),
    ).toBe(true);
  });

  it('rejects tiles that only touch diagonally', () => {
    expect(
      isPathNetworkConnected([
        { x: 0, z: 0 },
        { x: 1, z: 1 },
      ]),
    ).toBe(false);
  });
});

describe('the resort plan', () => {
  const items: LayoutItem[] = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
  }));

  it('gives every object in the catalogue a plot or a reason not to need one', () => {
    const layout = layoutResort(items, RESORT_PLAN);
    expect(layout.placements.length).toBe(RESORT_PLAN.plots.length);
    expect(new Set(layout.placements.map((placement) => placement.key)).size).toBe(
      layout.placements.length,
    );
    const placed = new Set(layout.placements.map((placement) => placement.id));
    for (const type of OBJECT_TYPES) {
      if (DERIVED_IDS.has(type.id)) continue;
      expect(placed).toContain(type.id);
    }
  });

  it('keeps every object on tile boundaries inside the plot', () => {
    const layout = layoutResort(items, RESORT_PLAN);
    for (const placement of [...layout.placements, ...layout.props, ...layout.paths]) {
      expect(placement.tileX).toBeGreaterThanOrEqual(0);
      expect(placement.tileZ).toBeGreaterThanOrEqual(0);
      expect(placement.tileX + placement.tilesX).toBeLessThanOrEqual(RESORT_PLAN.tilesX);
      expect(placement.tileZ + placement.tilesZ).toBeLessThanOrEqual(RESORT_PLAN.tilesZ);
    }
  });

  it('never lets two objects share a tile', () => {
    // occupiedTiles throws on overlap; reaching the count means it found none.
    const occupied = occupiedTiles(items, RESORT_PLAN);
    const claimed = RESORT_PLAN.plots.reduce((total, plot) => {
      const found = items.find((entry) => entry.id === plot.id)!;
      return total + found.tilesX * found.tilesZ;
    }, 0);
    expect(occupied.size).toBe(claimed);
  });

  it('never paves a tile an object stands on', () => {
    const occupied = occupiedTiles(items, RESORT_PLAN);
    for (const tile of pathTilesFor(items, RESORT_PLAN)) {
      expect(occupied.has(`${tile.x},${tile.z}`)).toBe(false);
    }
  });

  it('routes the paths as one connected network', () => {
    const tiles = pathTilesFor(items, RESORT_PLAN);
    expect(tiles.length).toBeGreaterThan(100);
    expect(isPathNetworkConnected(tiles)).toBe(true);
  });

  it('leaves every object reachable from the path network', () => {
    expect(plotsWithoutPathAccess(items, RESORT_PLAN)).toEqual([]);
  });

  it('paves sparingly: streets and spurs, not blocks', () => {
    const tiles = pathTilesFor(items, RESORT_PLAN);
    expect(tiles.length).toBeLessThan((RESORT_PLAN.tilesX * RESORT_PLAN.tilesZ) / 4);
  });

  it('dresses the paths with lamps and hedges', () => {
    const layout = layoutResort(items, RESORT_PLAN);
    const lamps = layout.props.filter((prop) => prop.id === LAMP_ID);
    const hedges = layout.props.filter((prop) => prop.id === HEDGE_ID);
    expect(lamps.length).toBeGreaterThan(20);
    expect(hedges.length).toBeGreaterThan(50);
  });

  it('stands more than one of the types the resort repeats', () => {
    const layout = layoutResort(items, RESORT_PLAN);
    const counts = new Map<string, number>();
    for (const placement of layout.placements) {
      counts.set(placement.id, (counts.get(placement.id) ?? 0) + 1);
    }
    expect(counts.get('cottage')).toBeGreaterThan(5);
    expect(counts.get('bungalow')).toBeGreaterThan(5);
  });
});

describe('a plot with a shore', () => {
  /** A 12x12 plot whose southern end is sea, with one street across the top. */
  const items = [
    item(PATH_ID),
    item(BOARDWALK_ID),
    item('hut', 2, 2),
    item(LAMP_ID),
    item(HEDGE_ID),
  ];
  const coastal = (over: Partial<ResortPlan> = {}): ResortPlan => ({
    tilesX: 12,
    tilesZ: 12,
    plots: [{ id: 'hut', tileX: 0, tileZ: 4 }],
    nodes: [node('nw', 0, 2), node('ne', 11, 2), node('s', 5, 11)],
    edges: [
      { from: 'nw', to: 'ne' },
      { from: 'ne', to: 's', bend: 'z-first' },
    ],
    plazas: [],
    // Water from row 9 down, with four rows of sand in front of it.
    shore: { inset: 2, beach: 4, wave: 0, seed: 1 },
    standsWholeCatalogue: false,
    ...over,
  });

  it('lays the water and the sand across the whole width', () => {
    const shore = shoreFor(coastal())!;
    expect(waterStartZ(shore, 0)).toBe(9);
    for (let x = 0; x < 12; x++) {
      expect({ x, at: terrainAt(shore, x, 9) }).toEqual({ x, at: 'water' });
      expect({ x, at: terrainAt(shore, x, 8) }).toEqual({ x, at: 'beach' });
      expect({ x, at: terrainAt(shore, x, 4) }).toEqual({ x, at: 'land' });
    }
  });

  it('paves the sand with a boardwalk and the grass with flagstones', () => {
    const shore = shoreFor(coastal())!;
    const { paths } = layoutResort(items, coastal());
    expect(paths.some((tile) => tile.id === BOARDWALK_ID)).toBe(true);
    for (const tile of paths) {
      expect({ tile: tile.key, id: tile.id }).toEqual({
        tile: tile.key,
        id: terrainAt(shore, tile.tileX, tile.tileZ) === 'beach' ? BOARDWALK_ID : PATH_ID,
      });
    }
  });

  it('falls back to flagstones when the catalogue has no boardwalk', () => {
    const bare = [item(PATH_ID), item('hut', 2, 2)];
    const paths = layoutResort(bare, coastal()).paths;
    expect(paths.every((tile) => tile.id === PATH_ID)).toBe(true);
  });

  it('never paves the sea', () => {
    const shore = shoreFor(coastal())!;
    for (const tile of pathTilesFor(items, coastal())) {
      expect(terrainAt(shore, tile.x, tile.z)).not.toBe('water');
    }
  });

  it('stops a street at the water rather than refusing the plan', () => {
    const shore = shoreFor(coastal())!;
    const tiles = streetTiles(coastal());
    // The second edge runs down column 11 to row 11, and the sea takes its end.
    expect(tiles.some((tile) => tile.x === 11 && tile.z === 2)).toBe(true);
    expect(tiles.every((tile) => terrainAt(shore, tile.x, tile.z) !== 'water')).toBe(true);
    expect(Math.max(...tiles.filter((tile) => tile.x === 11).map((tile) => tile.z))).toBe(
      waterStartZ(shore, 11) - 1,
    );
  });

  it('still refuses a street that leaves the plot', () => {
    expect(() =>
      streetTiles(coastal({ nodes: [node('nw', 0, 2), node('ne', 12, 2), node('s', 5, 11)] })),
    ).toThrow(/leaves the plot/);
  });

  it('refuses an object standing in the sea', () => {
    expect(() =>
      layoutResort(items, coastal({ plots: [{ id: 'hut', tileX: 2, tileZ: 10 }] })),
    ).toThrow(/stands in the sea/);
  });

  it('plants no lamp or hedge on the sand', () => {
    const shore = shoreFor(coastal())!;
    const { lamps, hedges } = decorationsFor(items, coastal());
    for (const tile of [...lamps, ...hedges]) {
      expect(terrainAt(shore, tile.x, tile.z)).toBe('land');
    }
  });

  it('leaves everything on the beach reachable', () => {
    const withHut = coastal({
      plots: [
        { id: 'hut', tileX: 0, tileZ: 4 },
        // On the sand, two rows back from the water.
        { id: 'hut', tileX: 2, tileZ: 6 },
      ],
    });
    expect(plotsWithoutPathAccess(items, withHut)).toEqual([]);
  });
});

describe('placementCenter', () => {
  it('takes the middle of the model, not of its footprint', () => {
    const narrow: LayoutItem = { id: 'hut', tilesX: 2, tilesZ: 2, width: 20, depth: 32 };
    const { placements } = layoutResort([item(PATH_ID), narrow], tinyPlan);
    expect(placementCenter(placements[0]!)).toEqual({ x: TILE_VOXELS + 16, z: TILE_VOXELS + 16 });
  });
});
