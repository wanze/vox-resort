import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { layoutResort, streetTiles, tileKey } from './resortLayout';
import { BOARDWALK_ID, DERIVED_IDS, HEDGE_ID, LAMP_ID, PATH_ID, STAIRS_ID } from './resortPlan';
import { elevationFor, levelAt } from './elevation';
import { beachDepthAt, beachTilesOf, shoreFor, terrainAt, waterTilesOf } from './shoreline';
import { rotateExtent, ROTATIONS } from './rotation';
import {
  clampParams,
  createRandom,
  emptyResortPlan,
  generateResort,
  PLOT_DENSITY,
  PLOT_TILES,
  type GeneratorType,
  type ResortParams,
} from './resortGenerator';

const TYPES: GeneratorType[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  category: type.category,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
}));

const ITEMS = OBJECT_TYPES.map(layoutItemFor);

const BY_ID = new Map(TYPES.map((type) => [type.id, type]));

/** The tiles a plot claims, which is not its type's footprint once it is turned. */
const footprintOf = (plot: { id: string; rotation?: 0 | 1 | 2 | 3 }) => {
  const type = BY_ID.get(plot.id)!;
  return rotateExtent(type.tilesX, type.tilesZ, plot.rotation ?? 0);
};

const params = (overrides: Partial<ResortParams> = {}): ResortParams => ({
  tilesX: 112,
  tilesZ: 100,
  density: 0.7,
  seed: 1,
  ...overrides,
});

/** Every seed and size the suite sweeps, as one list of parameter sets. */
const SWEEP: ResortParams[] = [
  ...Array.from({ length: 12 }, (_, seed) => params({ seed })),
  ...[40, 56, 80, 112, 140, 160].flatMap((size) => [
    params({ tilesX: size, tilesZ: size, seed: size }),
    params({ tilesX: size, tilesZ: Math.max(40, Math.round(size * 0.6)), seed: size + 1 }),
  ]),
  ...[0.2, 0.4, 1].map((density) => params({ density, seed: 99 })),
];

/** The first eight numbers a seed produces. */
const draw = (seed: number): number[] => Array.from({ length: 8 }, createRandom(seed));

describe('createRandom', () => {
  it('gives the same run twice for the same seed', () => {
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it('stays inside the unit interval', () => {
    const drawn = Array.from({ length: 500 }, createRandom(3));
    expect(Math.min(...drawn)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drawn)).toBeLessThan(1);
  });

  it('spreads over the interval rather than sticking near one end', () => {
    const drawn = Array.from({ length: 2000 }, createRandom(11));
    const mean = drawn.reduce((sum, value) => sum + value, 0) / drawn.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('clampParams', () => {
  it('pulls a plot too small up to the smallest one that works', () => {
    expect(clampParams(params({ tilesX: 4, tilesZ: 4 }))).toMatchObject({
      tilesX: PLOT_TILES.min,
      tilesZ: PLOT_TILES.min,
    });
  });

  it('pulls a plot too large down to what is worth baking', () => {
    expect(clampParams(params({ tilesX: 5000, tilesZ: 5000 }))).toMatchObject({
      tilesX: PLOT_TILES.max,
      tilesZ: PLOT_TILES.max,
    });
  });

  it('keeps density in range and the seed a whole number', () => {
    expect(clampParams(params({ density: 5 })).density).toBe(PLOT_DENSITY.max);
    expect(clampParams(params({ density: -1 })).density).toBe(PLOT_DENSITY.min);
    expect(clampParams(params({ seed: -7.8 })).seed).toBe(7);
  });

  it('rounds a fractional plot size to whole tiles', () => {
    expect(clampParams(params({ tilesX: 80.6 })).tilesX).toBe(81);
  });
});

describe('generateResort', () => {
  it('is a pure function of its parameters', () => {
    expect(generateResort(TYPES, params())).toEqual(generateResort(TYPES, params()));
  });

  it('gives a different resort for a different seed', () => {
    const one = generateResort(TYPES, params({ seed: 1 }));
    const other = generateResort(TYPES, params({ seed: 2 }));
    expect(one.plots).not.toEqual(other.plots);
  });

  it('builds more on a denser plot', () => {
    const sparse = generateResort(TYPES, params({ density: PLOT_DENSITY.min }));
    const packed = generateResort(TYPES, params({ density: PLOT_DENSITY.max }));
    expect(packed.plots.length).toBeGreaterThan(sparse.plots.length * 1.5);
  });

  it('builds more on a bigger plot', () => {
    const small = generateResort(TYPES, params({ tilesX: 48, tilesZ: 48 }));
    const large = generateResort(TYPES, params({ tilesX: 144, tilesZ: 144 }));
    expect(large.plots.length).toBeGreaterThan(small.plots.length);
  });

  it('never places an object the layout scatters for itself', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      for (const plot of plan.plots) {
        expect([...DERIVED_IDS]).not.toContain(plot.id);
      }
    }
  });

  it('stands the whole catalogue, at every size and density it offers', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const planted = new Set(plan.plots.map((plot) => plot.id));
      const owed = TYPES.filter((type) => !DERIVED_IDS.has(type.id) && !planted.has(type.id));
      expect({ set, missing: owed.map((type) => type.id) }).toEqual({ set, missing: [] });
      expect(plan.standsWholeCatalogue).toBe(true);
    }
  });

  it('keeps every object inside the plot, turned as it stands', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      for (const plot of plan.plots) {
        const footprint = footprintOf(plot);
        expect(plot.tileX).toBeGreaterThanOrEqual(0);
        expect(plot.tileZ).toBeGreaterThanOrEqual(0);
        expect(plot.tileX + footprint.x).toBeLessThanOrEqual(plan.tilesX);
        expect(plot.tileZ + footprint.z).toBeLessThanOrEqual(plan.tilesZ);
      }
    }
  });

  it('never overlaps two objects, turned as they stand', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const taken = new Set<string>();
      for (const plot of plan.plots) {
        const footprint = footprintOf(plot);
        for (let z = plot.tileZ; z < plot.tileZ + footprint.z; z++) {
          for (let x = plot.tileX; x < plot.tileX + footprint.x; x++) {
            expect(taken.has(tileKey(x, z))).toBe(false);
            taken.add(tileKey(x, z));
          }
        }
      }
    }
  });

  it('does not stand the whole resort facing one way', () => {
    // The point of the feature: a plot on which every turn is the same one is a
    // housing estate, whatever else it gets right.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const turns = new Set(plan.plots.map((plot) => plot.rotation ?? 0));
      expect({ set, turns: turns.size }).toEqual({ set, turns: ROTATIONS.length });
    }
  });

  it('keeps most objects square to the row they stand in', () => {
    // A quarter turn is the exception: it is what stops a row reading as a line
    // of clones, and a plot where it were the rule would read as a scrapyard.
    for (const set of SWEEP) {
      const plots = generateResort(TYPES, set).plots;
      const square = plots.filter((plot) => (plot.rotation ?? 0) % 2 === 0).length;
      expect({ set, most: square > plots.length * 0.6 }).toEqual({ set, most: true });
    }
  });

  it('turns the far gate to face back up the promenade', () => {
    // Landmarks are stood before anything else, so the gates are the first two
    // plots on the plan; the pair is the one place a turn is authored outright.
    const plan = generateResort(TYPES, params());
    expect(plan.plots.slice(0, 2)).toMatchObject([
      { id: 'entrance', tileZ: 0, rotation: 0 },
      { id: 'entrance', rotation: 2 },
    ]);
  });

  it('routes streets that stay on the plot', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      expect(() => streetTiles(plan)).not.toThrow();
      expect(streetTiles(plan).length).toBeGreaterThan(0);
    }
  });

  it('produces a plan the layout accepts, at every size, seed and density', () => {
    // The one that matters: `layoutResort` throws on an overlap, an object off
    // the plot, an unknown type, or an object it cannot grow a spur from. A
    // generator that satisfies it has satisfied every invariant the hand-written
    // plan is held to.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      expect(() => layoutResort(ITEMS, plan)).not.toThrow();
    }
  });

  it('lays paths, lamps and hedges out around what it generated', () => {
    const layout = layoutResort(ITEMS, generateResort(TYPES, params()));
    expect(layout.paths.length).toBeGreaterThan(0);
    expect(layout.props.some((prop) => prop.id === LAMP_ID)).toBe(true);
    expect(layout.props.some((prop) => prop.id === HEDGE_ID)).toBe(true);
  });
});

describe('the shore a generated plot gets', () => {
  it('cuts the sea into every plot, whatever its size', () => {
    for (const set of SWEEP) {
      const shore = shoreFor(generateResort(TYPES, set));
      expect({ set, sea: (shore ? waterTilesOf(shore) : []).length > 0 }).toEqual({
        set,
        sea: true,
      });
    }
  });

  it('stands nothing in the water', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const shore = shoreFor(plan)!;
      const wet = plan.plots.filter((plot) => terrainAt(shore, plot.tileX, plot.tileZ) === 'water');
      expect({ set, wet }).toEqual({ set, wet: [] });
    }
  });

  it('stands loungers and lodging on the sand', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const shore = shoreFor(plan)!;
    const onSand = plan.plots.filter(
      (plot) => terrainAt(shore, plot.tileX, plot.tileZ) === 'beach',
    );
    expect(onSand.length).toBeGreaterThan(10);
    expect(onSand.some((plot) => plot.id === 'sun-lounger')).toBe(true);
    expect(onSand.some((plot) => plot.id === 'bungalow')).toBe(true);
  });

  it('leaves the tideline and the lane behind the beach clear', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const shore = shoreFor(plan)!;
    const byId = new Map(TYPES.map((type) => [type.id, type]));
    const covered = new Set<string>();
    for (const plot of plan.plots) {
      const type = byId.get(plot.id)!;
      const footprint = rotateExtent(type.tilesX, type.tilesZ, plot.rotation ?? 0);
      for (let x = plot.tileX; x < plot.tileX + footprint.x; x++) {
        for (let z = plot.tileZ; z < plot.tileZ + footprint.z; z++) covered.add(`${x},${z}`);
      }
    }
    // The wet strip at the water and the lane against the grass: the two depths
    // `fillBeach` never builds on, so a boardwalk can always be walked in.
    const reserved = beachTilesOf(shore).filter((tile) => {
      const depth = beachDepthAt(shore, tile.x, tile.z);
      return depth === 0 || depth === shore.spec.beach - 1;
    });
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved.filter((tile) => covered.has(`${tile.x},${tile.z}`))).toEqual([]);
  });

  it('paves the beach with boardwalks, the steps with stairs and the rest with flagstones', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const shore = shoreFor(plan)!;
    const elevation = elevationFor(plan)!;
    const { paths } = layoutResort(ITEMS, plan);
    const paved = new Set(paths.map((tile) => `${tile.tileX},${tile.tileZ}`));

    expect(paths.some((tile) => tile.id === BOARDWALK_ID)).toBe(true);
    expect(paths.some((tile) => tile.id === STAIRS_ID)).toBe(true);

    for (const tile of paths) {
      // Taken from what a flight *is* rather than from the classifier: a paved
      // tile with paved ground one level above it on any side.
      const level = levelAt(elevation, tile.tileX, tile.tileZ);
      const climbs = [
        [0, -1],
        [-1, 0],
        [0, 1],
        [1, 0],
      ].some(
        ([dx, dz]) =>
          paved.has(`${tile.tileX + dx!},${tile.tileZ + dz!}`) &&
          levelAt(elevation, tile.tileX + dx!, tile.tileZ + dz!) === level + 1,
      );
      const sand = terrainAt(shore, tile.tileX, tile.tileZ) === 'beach';
      expect({ key: tile.key, id: tile.id }).toEqual({
        key: tile.key,
        id: climbs ? STAIRS_ID : sand ? BOARDWALK_ID : PATH_ID,
      });
    }
  });

  it('lays no stairs on the sand, because the beach is all one level', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const shore = shoreFor(plan)!;
    const { paths } = layoutResort(ITEMS, plan);
    for (const tile of paths) {
      if (tile.id !== STAIRS_ID) continue;
      expect(terrainAt(shore, tile.tileX, tile.tileZ)).not.toBe('beach');
    }
  });
});

describe('emptyResortPlan', () => {
  it('has nothing on it', () => {
    const plan = emptyResortPlan(80, 80);
    expect(plan.plots).toEqual([]);
    expect(plan.nodes).toEqual([]);
    expect(plan.edges).toEqual([]);
    expect(plan.plazas).toEqual([]);
  });

  it('does not claim to stand the catalogue, so the layout lets it be empty', () => {
    expect(emptyResortPlan(80, 80).standsWholeCatalogue).toBe(false);
    const layout = layoutResort(ITEMS, emptyResortPlan(80, 80));
    expect(layout.placements).toEqual([]);
    expect(layout.paths).toEqual([]);
    expect(layout.props).toEqual([]);
  });

  it('keeps its size, clamped to what the generator will work at', () => {
    expect(emptyResortPlan(64, 72)).toMatchObject({ tilesX: 64, tilesZ: 72 });
    expect(emptyResortPlan(1, 1)).toMatchObject({ tilesX: PLOT_TILES.min, tilesZ: PLOT_TILES.min });
  });
});
