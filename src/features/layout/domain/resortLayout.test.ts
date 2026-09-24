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
  tileKey,
  widthOffsets,
  type LayoutItem,
  type ResortLayout,
} from './resortLayout';
import {
  BENCH_ID,
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
  DERIVED_IDS,
  HEDGE_ID,
  JETTY_ID,
  LAMP_ID,
  PATH_ID,
  RAILING_ID,
  RESORT_PLAN,
  STAIR_RAILING_ID,
  type ResortPlan,
} from './resortPlan';
import { shoreFor, terrainAt, waterStartZ } from './shoreline';
import { elevationFor, levelAt, levelHeight } from './elevation';
import { doorStepTile, placedDoors } from './doorStep';
import { clampParams, generateResort } from './resortGenerator';
import { terrainFor } from './terrain';

const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * TILE_VOXELS,
  depth: tilesZ * TILE_VOXELS,
});

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
    expect(tiles.has('1,0')).toBe(true);
    expect(tiles.has('2,1')).toBe(true);
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
    const narrow: LayoutItem = { id: 'post', tilesX: 2, tilesZ: 2, width: 4, depth: 4 };
    expect(place(narrow, 'post', 0, 0, 0, 2).y).toBe(2 * LEVEL_VOXELS);
  });
});

describe('a terraced plot', () => {
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
    const across: ResortPlan = {
      ...tinyPlan,
      elevation: { terraces: [{ level: 1, inset: 1, wave: 0 }], seed: 1 },
    };
    expect(() => layoutResort(tinyItems, across)).toThrow(/"hut" straddles a step at tile 1,2/);
  });

  it('accepts a one-tile object either side of a step', () => {
    const { paths } = layoutResort(tinyItems, terraced);
    expect(paths.filter((tile) => tile.y === 0).length).toBeGreaterThan(0);
    expect(paths.filter((tile) => tile.y === LEVEL_VOXELS).length).toBeGreaterThan(0);
  });
});

describe('handrails', () => {
  const railItem: LayoutItem = {
    id: RAILING_ID,
    tilesX: 1,
    tilesZ: 1,
    width: TILE_VOXELS,
    depth: 2,
  };
  const railItems: LayoutItem[] = [item(PATH_ID), railItem, item(STAIR_RAILING_ID)];

  const bench: ResortPlan = {
    tilesX: 5,
    tilesZ: 5,
    plots: [],
    nodes: [
      { id: 'w', tileX: 0, tileZ: 1 },
      { id: 'e', tileX: 4, tileZ: 1 },
      { id: 's', tileX: 0, tileZ: 4 },
    ],
    edges: [
      { from: 'w', to: 'e' },
      { from: 'w', to: 's', bend: 'z-first' },
    ],
    plazas: [],
    elevation: { terraces: [{ level: 1, inset: 2, anchor: 'plot', wave: 0 }], seed: 1 },
    standsWholeCatalogue: false,
  };

  it('rails the walk along the top of the step, and nothing else', () => {
    const { rails } = layoutResort(railItems, bench);
    const edges = rails.filter((rail) => rail.id === RAILING_ID);
    expect(edges.map((rail) => rail.tileX).toSorted()).toEqual([1, 2, 3, 4]);
    expect(edges.every((rail) => rail.tileZ === 1 && rail.rotation === 2)).toBe(true);
  });

  it('stands an edge rail flush against the edge it guards', () => {
    const { rails } = layoutResort(railItems, bench);
    const rail = rails.find((standing) => standing.id === RAILING_ID)!;
    expect({ x: rail.x, z: rail.z, y: rail.y }).toEqual({
      x: rail.tileX * TILE_VOXELS,
      z: rail.tileZ * TILE_VOXELS + TILE_VOXELS - 2,
      y: LEVEL_VOXELS,
    });
  });

  it('guards the flight where the lane comes down off the bench', () => {
    const { rails } = layoutResort(railItems, bench);
    const flight = rails.filter((rail) => rail.id === STAIR_RAILING_ID);
    expect(flight).toHaveLength(1);
    expect(flight[0]).toMatchObject({ tileX: 0, tileZ: 2, rotation: 0, y: 0 });
  });

  it('stands every rail on a tile that is paved', () => {
    const { rails, paths } = layoutResort(railItems, bench);
    const paved = new Set(paths.map((tile) => tileKey(tile.tileX, tile.tileZ)));
    expect(rails.length).toBeGreaterThan(0);
    for (const rail of rails) {
      expect({ rail: rail.key, paved: paved.has(tileKey(rail.tileX, rail.tileZ)) }).toEqual({
        rail: rail.key,
        paved: true,
      });
    }
  });

  it('rails nothing on a plot with no steps in it', () => {
    expect(layoutResort([...tinyItems, railItem, item(STAIR_RAILING_ID)], tinyPlan).rails).toEqual(
      [],
    );
  });

  it('lays no rails at all when the catalogue has none', () => {
    expect(layoutResort([item(PATH_ID)], bench).rails).toEqual([]);
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
    expect(placements[0]?.x).toBe(TILE_VOXELS + 6);
    expect(placements[0]?.z).toBe(TILE_VOXELS);
  });

  it('paves every street tile no object stands on', () => {
    const { paths } = layoutResort(tinyItems, tinyPlan);
    expect(paths).toHaveLength(12);
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
    expect(paved).toHaveLength(9);
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
  const edited: ResortPlan = {
    ...RESORT_PLAN,
    plots: [...RESORT_PLAN.plots, { id: 'cottage', tileX: 13, tileZ: 4 }],
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

    expect(was.size).toBeGreaterThan(3000);
    expect(added).toHaveLength(1);
    expect(removed).toEqual([]);
  });
});

describe('spurs', () => {
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
    expect(spur).toHaveLength(2);
    expect(spur.every((tile) => tile.x === 2 || tile.x === 3)).toBe(true);
    expect(isPathNetworkConnected(paved)).toBe(true);
  });

  it('grows nothing when a street already touches the object', () => {
    const touching: ResortPlan = { ...plan, plots: [{ id: 'hut', tileX: 2, tileZ: 1 }] };
    expect(pathTilesFor([item(PATH_ID), item('hut', 2, 2)], touching)).toHaveLength(7);
  });

  it('reports an object it cannot reach', () => {
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

const catalogueItems = (): LayoutItem[] =>
  OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
  }));

describe('decorationsFor', () => {
  const items = [item(PATH_ID), item('hut', 2, 2), item(LAMP_ID), item(HEDGE_ID), item(BENCH_ID)];

  it('never puts a lamp or a hedge on a paved or occupied tile', () => {
    const { lamps, hedges } = decorationsFor(items, tinyPlan);
    const paved = new Set(pathTilesFor(items, tinyPlan).map((tile) => `${tile.x},${tile.z}`));
    const occupied = new Set(occupiedTiles(items, tinyPlan).keys());
    for (const tile of [...lamps, ...hedges]) {
      expect(paved.has(`${tile.x},${tile.z}`)).toBe(false);
      expect(occupied.has(`${tile.x},${tile.z}`)).toBe(false);
    }
  });

  it('lines an avenue with trees in straight rows, and no hedges', () => {
    const street = { x0: 0, x1: 11, z0: 3, z1: 4 };
    const avenue: ResortPlan = {
      tilesX: 12,
      tilesZ: 8,
      plots: [],
      nodes: [],
      edges: [],
      plazas: [street],
      standsWholeCatalogue: false,
    };
    const lined = [...items, item('cypress')];
    const plain = decorationsFor(lined, avenue);
    expect(plain.trees).toEqual([]);
    expect(plain.hedges.length).toBeGreaterThan(0);
    const { trees, hedges, lamps, benches } = decorationsFor(lined, {
      ...avenue,
      avenues: { tree: 'cypress', streets: [street] },
    });
    expect(hedges).toEqual([]);
    expect(trees.length).toBeGreaterThan(2);
    const others = new Set(
      [...lamps, ...benches.map((bench) => bench.tile)].map((t) => `${t.x},${t.z}`),
    );
    for (const tree of trees) {
      expect([2, 5]).toContain(tree.z);
      expect(tree.x % 3).toBe(0);
      expect(others.has(`${tree.x},${tree.z}`)).toBe(false);
    }
    const props = layoutResort(lined, {
      ...avenue,
      avenues: { tree: 'cypress', streets: [street] },
    }).props;
    expect(props.filter((prop) => prop.id === 'cypress')).toHaveLength(trees.length);
  });

  it('never puts a bench on a paved or occupied tile either', () => {
    const { benches } = decorationsFor(items, tinyPlan);
    const paved = new Set(pathTilesFor(items, tinyPlan).map((tile) => `${tile.x},${tile.z}`));
    const occupied = new Set(occupiedTiles(items, tinyPlan).keys());
    for (const { tile } of benches) {
      expect(paved.has(`${tile.x},${tile.z}`)).toBe(false);
      expect(occupied.has(`${tile.x},${tile.z}`)).toBe(false);
    }
  });

  it('turns every bench to face the path it stands beside', () => {
    const { benches } = decorationsFor(catalogueItems(), RESORT_PLAN);
    const paved = new Set(
      pathTilesFor(catalogueItems(), RESORT_PLAN).map((tile) => `${tile.x},${tile.z}`),
    );
    expect(benches.length).toBeGreaterThan(10);
    const towards = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const;
    for (const { tile, rotation } of benches) {
      const [dx, dz] = towards[rotation]!;
      expect(
        paved.has(`${tile.x + dx},${tile.z + dz}`),
        `the bench at ${tile.x},${tile.z} faces no path`,
      ).toBe(true);
    }
  });

  it('stands no two benches on top of each other', () => {
    const { benches } = decorationsFor(catalogueItems(), RESORT_PLAN);
    for (const a of benches) {
      for (const b of benches) {
        if (a === b) continue;
        expect(
          Math.max(Math.abs(a.tile.x - b.tile.x), Math.abs(a.tile.z - b.tile.z)),
        ).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('keeps lamps at least the spacing apart', () => {
    const { lamps } = decorationsFor(catalogueItems(), RESORT_PLAN, 6);
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

  it('dresses the paths with lamps, benches and hedges', () => {
    const layout = layoutResort(items, RESORT_PLAN);
    const lamps = layout.props.filter((prop) => prop.id === LAMP_ID);
    const hedges = layout.props.filter((prop) => prop.id === HEDGE_ID);
    const benches = layout.props.filter((prop) => prop.id === BENCH_ID);
    expect(lamps.length).toBeGreaterThan(20);
    expect(hedges.length).toBeGreaterThan(50);
    expect(benches.length).toBeGreaterThan(10);
    expect(benches.some((bench) => bench.rotation !== 0)).toBe(true);
    for (const bench of benches) {
      expect(bench.tilesX).toBe(1);
      expect(bench.tilesZ).toBe(1);
    }
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
  const items = [
    item(PATH_ID),
    item(BOARDWALK_ID),
    item(JETTY_ID),
    item(BRIDGE_ID),
    item(BRIDGE_RAMP_ID),
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
    ).toThrow(/stands in the water/);
  });

  it('bridges a street where the plan carries a river under it', () => {
    const river = coastal({
      plots: [],
      terrain: [
        { tileX: 5, tileZ: 1, level: 0, surface: 'water' },
        { tileX: 5, tileZ: 2, level: 0, surface: 'water' },
        { tileX: 5, tileZ: 3, level: 0, surface: 'water' },
      ],
    });
    const laid = layoutResort(items, river);
    const crossing = laid.paths.find((path) => path.tileX === 5 && path.tileZ === 2);
    expect({ id: crossing?.id, rotation: crossing?.rotation }).toEqual({
      id: BRIDGE_RAMP_ID,
      rotation: 1,
    });
    expect(laid.paths.find((path) => path.tileX === 4 && path.tileZ === 2)?.id).toBe(PATH_ID);
  });

  it('brings a crossing ashore at both ends, and levels the middle of it', () => {
    const river = coastal({
      plots: [],
      terrain: [4, 5, 6].flatMap((tileX) =>
        [1, 2, 3].map((tileZ) => ({ tileX, tileZ, level: 0, surface: 'water' }) as const),
      ),
    });
    const laid = layoutResort(items, river);
    const crossing = [4, 5, 6].map((tileX) =>
      laid.paths.find((path) => path.tileX === tileX && path.tileZ === 2),
    );
    expect(crossing.map((tile) => ({ id: tile?.id, rotation: tile?.rotation }))).toEqual([
      { id: BRIDGE_RAMP_ID, rotation: 1 },
      { id: BRIDGE_ID, rotation: 1 },
      { id: BRIDGE_RAMP_ID, rotation: 3 },
    ]);
  });

  it('rails a crossing with the bridge parapets, because its deck is a metre up', () => {
    const railed = [
      ...items,
      item(RAILING_ID, 16, 2),
      item(BRIDGE_RAILING_ID, 16, 2),
      item(BRIDGE_RAMP_RAILING_LEFT_ID, 16, 2),
      item(BRIDGE_RAMP_RAILING_RIGHT_ID, 16, 2),
    ];
    const river = coastal({
      plots: [],
      terrain: [4, 5, 6].flatMap((tileX) =>
        [1, 2, 3].map((tileZ) => ({ tileX, tileZ, level: 0, surface: 'water' }) as const),
      ),
    });
    const laid = layoutResort(railed, river);
    const guarded = laid.rails
      .filter((rail) => rail.tileZ === 2 && rail.tileX >= 4 && rail.tileX <= 6)
      .map((rail) => ({ id: rail.id, x: rail.tileX, rotation: rail.rotation }))
      .toSorted((a, b) => a.x - b.x || a.rotation - b.rotation);
    expect(guarded).toEqual([
      { id: BRIDGE_RAMP_RAILING_LEFT_ID, x: 4, rotation: 0 },
      { id: BRIDGE_RAMP_RAILING_RIGHT_ID, x: 4, rotation: 2 },
      { id: BRIDGE_RAILING_ID, x: 5, rotation: 0 },
      { id: BRIDGE_RAILING_ID, x: 5, rotation: 2 },
      { id: BRIDGE_RAMP_RAILING_RIGHT_ID, x: 6, rotation: 0 },
      { id: BRIDGE_RAMP_RAILING_LEFT_ID, x: 6, rotation: 2 },
    ]);
  });

  it('refuses an object standing in a river the plan carries', () => {
    expect(() =>
      layoutResort(
        items,
        coastal({
          plots: [{ id: 'hut', tileX: 2, tileZ: 5 }],
          terrain: [{ tileX: 2, tileZ: 5, level: 0, surface: 'water' }],
        }),
      ),
    ).toThrow(/stands in the water at tile 2,5/);
  });

  const withPier = (): ResortPlan =>
    coastal({
      edges: [
        { from: 'nw', to: 'ne' },
        { from: 'ne', to: 's', overWater: true },
      ],
    });

  it('carries a pier out over the water and paves it with the jetty', () => {
    const shore = shoreFor(withPier())!;
    const { paths } = layoutResort(items, withPier());
    const wet = paths.filter((tile) => terrainAt(shore, tile.tileX, tile.tileZ) === 'water');
    expect(wet.map((tile) => tile.tileZ).toSorted((a, b) => a - b)).toEqual([9, 10, 11]);
    expect(wet.every((tile) => tile.id === JETTY_ID && tile.tileX === 5)).toBe(true);
  });

  it('rails a pier down both flanks and across its head', () => {
    const railed = [
      ...items,
      { id: RAILING_ID, tilesX: 1, tilesZ: 1, width: TILE_VOXELS, depth: 2 },
    ];
    const { rails } = layoutResort(railed, withPier());
    const head = rails.filter((rail) => rail.tileZ === 11);
    expect(head.map((rail) => rail.rotation).toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
    for (const z of [9, 10]) {
      const along = rails.filter((rail) => rail.tileZ === z);
      expect({ z, turns: along.map((rail) => rail.rotation).toSorted((a, b) => a - b) }).toEqual({
        z,
        turns: [1, 3],
      });
    }
  });

  it('falls back to decking when the catalogue has no jetty', () => {
    const noPier = items.filter((candidate) => candidate.id !== JETTY_ID);
    const shore = shoreFor(withPier())!;
    const { paths } = layoutResort(noPier, withPier());
    const wet = paths.filter((tile) => terrainAt(shore, tile.tileX, tile.tileZ) === 'water');
    expect(wet.length).toBe(3);
    expect(wet.every((tile) => tile.id === BOARDWALK_ID)).toBe(true);
  });

  it('routes no spur over the water, pier or no pier', () => {
    const shore = shoreFor(withPier())!;
    const stilted = withPier();
    for (const tile of pathTilesFor(items, stilted)) {
      if (terrainAt(shore, tile.x, tile.z) !== 'water') continue;
      expect({ x: tile.x, z: tile.z }).toEqual({ x: 5, z: tile.z });
    }
  });

  it('plants no lamp, bench or hedge on the sand', () => {
    const shore = shoreFor(coastal())!;
    const { lamps, benches, hedges } = decorationsFor(items, coastal());
    for (const tile of [...lamps, ...hedges, ...benches.map((bench) => bench.tile)]) {
      expect(terrainAt(shore, tile.x, tile.z)).toBe('land');
    }
  });

  it('grows no spur to anything standing on the sand', () => {
    const shore = shoreFor(coastal())!;
    const withHut = coastal({
      plots: [
        { id: 'hut', tileX: 0, tileZ: 4 },
        { id: 'hut', tileX: 2, tileZ: 6 },
      ],
    });
    const bare = pathTilesFor(items, coastal());
    const withOne = pathTilesFor(items, withHut);
    expect(withOne.length).toBe(bare.length);
    expect(plotsWithoutPathAccess(items, withHut)).toEqual([]);
    expect(
      withOne.filter((tile) => terrainAt(shore, tile.x, tile.z) === 'beach' && tile.x === 2),
    ).toEqual([]);
  });
});

describe('placementCenter', () => {
  it('takes the middle of the model, not of its footprint', () => {
    const narrow: LayoutItem = { id: 'hut', tilesX: 2, tilesZ: 2, width: 20, depth: 32 };
    const { placements } = layoutResort([item(PATH_ID), narrow], tinyPlan);
    expect(placementCenter(placements[0]!)).toEqual({ x: TILE_VOXELS + 16, z: TILE_VOXELS + 16 });
  });
});

const hutOf = (layout: ResortLayout) => layout.placements.find((each) => each.id === 'hut')!;

const shutOut = (layout: ResortLayout, plan: ResortPlan): string[] => {
  const paved = new Set(layout.paths.map((tile) => tileKey(tile.tileX, tile.tileZ)));
  const terrain = terrainFor(plan);
  return layout.placements
    .filter((placement) => {
      const type = OBJECT_TYPES.find((each) => each.id === placement.id)!;
      const declared = type.venue?.doors ?? [];
      if (declared.length === 0) return false;
      if (terrain.surfaceOf(placement.tileX, placement.tileZ) !== 'grass') return false;
      const doors = placedDoors(placement, declared, type.model.width, type.model.depth);
      return !doors.some((door) => {
        const tile = doorStepTile(placement, door);
        return paved.has(tileKey(tile.x, tile.z));
      });
    })
    .map((placement) => placement.key);
};

const claimsOf = (layout: ResortLayout) =>
  layout.placements.map(({ key, id, tileX, tileZ, tilesX, tilesZ, width, depth }) => ({
    key,
    id,
    tileX,
    tileZ,
    area: tilesX * tilesZ,
    footprint: [tilesX, tilesZ],
    model: width * depth,
  }));

describe('turning a building to open its door onto paving', () => {
  const hut: LayoutItem = { ...item('hut', 2, 3), doors: [{ x: 15, z: 46, facing: 0 }] };
  const streetAlong = (side: 'north' | 'east', rotation: 0 | 1 | 2 | 3 = 0): ResortPlan => ({
    tilesX: 5,
    tilesZ: 5,
    plots: [{ id: 'hut', tileX: 1, tileZ: 1, rotation }],
    nodes:
      side === 'north' ? [node('a', 0, 0), node('b', 4, 0)] : [node('a', 3, 0), node('b', 3, 4)],
    edges: [{ from: 'a', to: 'b' }],
    plazas: [],
  });
  it('gives a building whose back is to the only street a half turn', () => {
    const placed = hutOf(layoutResort([item(PATH_ID), hut], streetAlong('north')));
    expect(placed.rotation).toBe(2);
    expect([placed.tileX, placed.tileZ, placed.tilesX, placed.tilesZ]).toEqual([1, 1, 2, 3]);
  });

  it('paves a spur to the door of a building whose flank is on the only street', () => {
    const layout = layoutResort([item(PATH_ID), hut], streetAlong('east'));
    const placed = hutOf(layout);
    expect([placed.tileX, placed.tileZ, placed.tilesX, placed.tilesZ]).toEqual([1, 1, 2, 3]);
    const [door] = placedDoors(placed, hut.doors!, hut.width, hut.depth);
    const step = doorStepTile(placed, door!);
    expect(layout.paths.map((tile) => tileKey(tile.tileX, tile.tileZ))).toContain(
      tileKey(step.x, step.z),
    );
    expect(
      isPathNetworkConnected(layout.paths.map((tile) => ({ x: tile.tileX, z: tile.tileZ }))),
    ).toBe(true);
  });

  it('falls back to the nearest side when something stands in front of every door', () => {
    const post: LayoutItem = { ...item('post'), category: 'grounds' };
    const plan: ResortPlan = {
      ...streetAlong('east'),
      plots: [
        { id: 'hut', tileX: 1, tileZ: 1, rotation: 0 },
        { id: 'post', tileX: 1, tileZ: 4 },
        { id: 'post', tileX: 2, tileZ: 0 },
      ],
    };
    const layout = layoutResort([item(PATH_ID), hut, post], plan);
    expect(hutOf(layout).rotation).toBe(0);
    expect(plotsWithoutPathAccess([item(PATH_ID), hut, post], plan)).toEqual([]);
  });

  it('leaves a building with no doors declared at the turn the plan gave it', () => {
    const bare = item('hut', 2, 3);
    expect(hutOf(layoutResort([item(PATH_ID), bare], streetAlong('north'))).rotation).toBe(0);
  });

  describe('on the generated plot', () => {
    const TYPES = OBJECT_TYPES.map((type) => ({
      id: type.id,
      tilesX: type.model.tiles.x,
      tilesZ: type.model.tiles.z,
      category: type.category,
      placement: type.model.placement,
    }));
    const withDoors: LayoutItem[] = OBJECT_TYPES.map((type) => ({
      id: type.id,
      tilesX: type.model.tiles.x,
      tilesZ: type.model.tiles.z,
      width: type.model.width,
      depth: type.model.depth,
      category: type.category,
      doors: type.venue?.doors ?? [],
    }));
    const without: LayoutItem[] = withDoors.map(({ doors: _doors, ...rest }) => rest);
    const planFor = (seed: number): ResortPlan =>
      generateResort(TYPES, clampParams({ tilesX: 112, tilesZ: 100, seed, density: 0.7 }));
    const plan = planFor(3);

    it('opens every door-declaring building on the grass onto paving', () => {
      expect(shutOut(layoutResort(without, plan), plan).length).toBeGreaterThan(20);
      expect(shutOut(layoutResort(withDoors, plan), plan)).toEqual(['playground']);
    });

    it('lays every plot it laid before, however the doors turn it', () => {
      for (const seed of [1, 3, 7, 11]) {
        expect(() => layoutResort(withDoors, planFor(seed)), `seed ${seed}`).not.toThrow();
      }
    });

    it('turns nothing onto different tiles, and keeps the paving in one piece', () => {
      const before = layoutResort(without, plan);
      const after = layoutResort(withDoors, plan);
      expect(claimsOf(after)).toEqual(claimsOf(before));
      const tiles = after.paths.map((tile) => ({ x: tile.tileX, z: tile.tileZ }));
      expect(isPathNetworkConnected(tiles)).toBe(
        isPathNetworkConnected(before.paths.map((tile) => ({ x: tile.tileX, z: tile.tileZ }))),
      );
    });
  });
});
