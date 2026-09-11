import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { layoutResort, streetTiles, tileKey } from './resortLayout';
import {
  BOARDWALK_ID,
  DERIVED_IDS,
  HEDGE_ID,
  LAMP_ID,
  PATH_ID,
  RAILING_ID,
  STAIR_RAILING_ID,
  STAIRS_ID,
} from './resortPlan';
import { elevationFor, levelAt, maxLevelOf, raisedTilesOf } from './elevation';
import { beachDepthAt, beachTilesOf, shoreFor, terrainAt, waterTilesOf } from './shoreline';
import { groundAt } from './ground';
import { rotateExtent, ROTATIONS } from './rotation';
import {
  clampParams,
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
    // A quarter more rather than half as much again: the beach and the hill are
    // filled on their own terms and the density slider does not reach them, so
    // what it moves is the districts behind them.
    expect(packed.plots.length).toBeGreaterThan(sparse.plots.length * 1.25);
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

  it('fills the sand with loungers, parasols and a club to walk to', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const shore = shoreFor(plan)!;
    const onSand = plan.plots.filter(
      (plot) => terrainAt(shore, plot.tileX, plot.tileZ) === 'beach',
    );
    expect(onSand.length).toBeGreaterThan(100);
    for (const id of ['sun-lounger', 'beach-umbrella', 'beach-club', 'poolside-bar']) {
      expect({ id, stood: onSand.some((plot) => plot.id === id) }).toEqual({ id, stood: true });
    }
  });

  it('lays the loungers and the parasols out in three lines along the water', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const shore = shoreFor(plan)!;
      const depths = new Set(
        plan.plots
          .filter(
            (plot) =>
              (plot.id === 'sun-lounger' || plot.id === 'beach-umbrella') &&
              terrainAt(shore, plot.tileX, plot.tileZ) === 'beach',
          )
          .map((plot) => beachDepthAt(shore, plot.tileX, plot.tileZ)),
      );
      // Three depths into the sand and no others: a line is a line however the
      // coast in front of it wanders, because a depth follows the water.
      expect({ set, lines: depths.size }).toEqual({ set, lines: 3 });
      // With clear sand between them, which is what makes them read as three.
      const sorted = [...depths].toSorted((a, b) => a - b);
      for (const [index, depth] of sorted.slice(1).entries()) {
        expect({ set, apart: depth - sorted[index]! >= 2 }).toEqual({ set, apart: true });
      }
    }
  });

  it('paves nothing across the beach but the lanes that run down to the water', () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const shore = shoreFor(plan)!;
      const { paths } = layoutResort(ITEMS, plan);
      const onSand = paths.filter((tile) => terrainAt(shore, tile.tileX, tile.tileZ) === 'beach');
      const perRow = new Map<number, number>();
      for (const tile of onSand) perRow.set(tile.tileZ, (perRow.get(tile.tileZ) ?? 0) + 1);
      // A walk along the beach would pave a whole row of it. What crosses the
      // sand now is a couple of lanes, so no row of sand carries more than a
      // handful of tiles — and no lounger grows a spur, because sand is walked
      // on. See `growSpurs`.
      const widest = Math.max(0, ...perRow.values());
      expect({ set, sparse: widest <= 4 }).toEqual({ set, sparse: true });
      // And they do reach the water, rather than stopping at the dune.
      expect({
        set,
        reaches: onSand.some((tile) => beachDepthAt(shore, tile.tileX, tile.tileZ) === 0),
      }).toEqual({ set, reaches: true });
    }
  });

  it('stands nothing anybody sleeps in on the beach itself', () => {
    // The lodgings moved up onto the shelf on top of the dune. A bungalow in the
    // middle of the sand read as a building somebody had left there.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const shore = shoreFor(plan)!;
      const lodging = plan.plots.filter(
        (plot) =>
          terrainAt(shore, plot.tileX, plot.tileZ) === 'beach' &&
          BY_ID.get(plot.id)!.category === 'lodging',
      );
      expect({ set, lodging }).toEqual({ set, lodging: [] });
    }
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
      // Sand rather than beach: the sidewalk along the shelf on top of the dune
      // is decking for the same reason the pier out to the water is.
      const sand = groundAt(shore, elevation, tile.tileX, tile.tileZ) === 'sand';
      expect({ key: tile.key, id: tile.id }).toEqual({
        key: tile.key,
        id: climbs ? STAIRS_ID : sand ? BOARDWALK_ID : PATH_ID,
      });
    }
  });

  it('lays no flight anywhere on the beach but the row it climbs off', () => {
    // The beach is all one level, so the only step it can host is the one at the
    // very back of it — the first of the dune's, whose lower tile is the last row
    // of sand. You climb off the beach; you never climb on it.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const shore = shoreFor(plan)!;
      const { paths } = layoutResort(ITEMS, plan);
      const wrong = paths.filter(
        (tile) =>
          tile.id === STAIRS_ID &&
          terrainAt(shore, tile.tileX, tile.tileZ) === 'beach' &&
          beachDepthAt(shore, tile.tileX, tile.tileZ) !== shore.spec.beach - 1,
      );
      expect({ set, wrong }).toEqual({ set, wrong: [] });
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

describe('the hill a generated plot gets', () => {
  it('raises a hill behind the beach and comes back down to sea level behind it', () => {
    // Sand at sea level, a dune off the back of it, a crest, and the resort
    // behind that back at zero: the levels climb and fall by one at a time and
    // end where they started, which is what makes it a hill rather than a cliff.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const elevation = elevationFor(plan);
      if (!elevation) continue;
      const levels = elevation.spec.terraces.map((terrace) => terrace.level);
      expect({ set, first: levels[0], last: levels[levels.length - 1] }).toEqual({
        set,
        first: 1,
        last: 0,
      });
      expect({ set, peak: maxLevelOf(elevation) >= 3 }).toEqual({ set, peak: true });
      const steps = levels.map((level, index) => Math.abs(level - (levels[index - 1] ?? 0)));
      expect({ set, steps: steps.every((step) => step === 1) }).toEqual({ set, steps: true });
    }
  });

  it('carries the beach up the dune and turns to grass above it', () => {
    // The first three benches are the dune, which is sand — the beach going on
    // up behind itself — and everything above them is lawn.
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const elevation = elevationFor(plan)!;
    const surfaces = elevation.spec.terraces.map((terrace) => terrace.surface);
    expect(surfaces.slice(0, 3)).toEqual(['sand', 'sand', 'sand']);
    expect(surfaces.slice(3).every((surface) => surface === 'grass')).toBe(true);
    // And the ground agrees: the shelf on top of the dune is sand you can build
    // on, well above sea level.
    const shore = shoreFor(plan);
    const shelf = raisedTilesOf(elevation).filter(
      (tile) => groundAt(shore, elevation, tile.x, tile.z) === 'sand',
    );
    expect(shelf.length).toBeGreaterThan(500);
  });

  it('leaves the plot too shallow for a hill flat rather than half-terraced', () => {
    // The hill loses a level at a time until it fits behind the beach with room
    // for a resort; a plot that cannot hold even the shortest one is left flat.
    const plan = generateResort(TYPES, params({ tilesX: 40, tilesZ: 40 }));
    expect(plan.elevation).toBeUndefined();
    expect(layoutResort(ITEMS, plan).paths.some((tile) => tile.id === STAIRS_ID)).toBe(false);
  });

  it('stands a neighbourhood on the hill rather than a token building', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const { placements } = layoutResort(ITEMS, plan);
    const raised = placements.filter((placement) => placement.y > 0);
    expect(raised.length).toBeGreaterThan(20);
    // And it is a mixed neighbourhood, not one repeated type.
    expect(new Set(raised.map((placement) => placement.id)).size).toBeGreaterThan(3);
  });

  it('puts the bungalows on the shelf and the houses on the benches above it', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const elevation = elevationFor(plan)!;
    const shore = shoreFor(plan);
    const on = (id: string, surface: string): number =>
      plan.plots.filter(
        (plot) => plot.id === id && groundAt(shore, elevation, plot.tileX, plot.tileZ) === surface,
      ).length;
    // A neighbourhood on each surface, not a token few. These are floors on
    // "enough to read as a neighbourhood" rather than measurements: the exact
    // count is a by-product of how the generator packs the plot, so it moves
    // whenever a large type's footprint changes — over the twelve seeds the
    // suite sweeps it ranges from 3 to 14 — and it is only pinned here because
    // this case fixes the seed. Widening `waterpark` from 5x5 to 6x6 tiles for
    // its three flumes moved this seed's houses-on-grass from 12 to 10, which
    // is packing, not a regression in where the generator puts a house.
    expect(on('bungalow', 'sand')).toBeGreaterThanOrEqual(10);
    expect(on('house', 'grass')).toBeGreaterThanOrEqual(10);
    // Houses at four heights or more: a hillside, not a terrace.
    const heights = new Set(
      plan.plots
        .filter((plot) => plot.id === 'house')
        .map((plot) => levelAt(elevation, plot.tileX, plot.tileZ)),
    );
    expect(heights.size).toBeGreaterThanOrEqual(4);
  });

  it('never turns a whole cross street into one long staircase', () => {
    // The failure the landward step is placed to avoid. Laid *on* a two-wide
    // cross street it splits the street lengthwise, and every column of it
    // becomes a flight — a stair wall the full width of the plot. Laid just past
    // it, the flights are only where north-south paths come down off the bench,
    // which is a dozen or so spread along that street rather than all of it.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const { paths } = layoutResort(ITEMS, plan);
      const perRow = new Map<number, number>();
      for (const tile of paths) {
        if (tile.id !== STAIRS_ID) continue;
        perRow.set(tile.tileZ, (perRow.get(tile.tileZ) ?? 0) + 1);
      }
      const widest = Math.max(0, ...perRow.values());
      // A quarter of the width is far above what the lanes crossing a street can
      // account for, and far below the every-column wall a split street gives.
      expect({ set, widest: widest < plan.tilesX / 4 }).toEqual({ set, widest: true });
    }
  });

  it('keeps every east-west street off the hill entirely', () => {
    // The other half of the same answer. A cross street is straight and the
    // hill's benches are not — they follow the coast — so a street laid across
    // one would drift on and off a step for its whole length. They are held
    // north of the hill instead, which is why every tile of every one of them is
    // at sea level.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const elevation = elevationFor(plan);
      if (!elevation) continue;
      const across = plan.edges.filter((edge) => edge.from.startsWith('band'));
      const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
      const raised = across.flatMap((edge) => {
        const row = nodes.get(edge.from)!.tileZ;
        return Array.from({ length: plan.tilesX }, (_, tileX) => tileX)
          .filter((tileX) => levelAt(elevation, tileX, row) > 0)
          .map((tileX) => `${tileX},${row}`);
      });
      expect({ set, raised }).toEqual({ set, raised: [] });
    }
  });

  it('climbs the hill from both sides', () => {
    // Flights up the seaward face and flights down the landward one: the two
    // face opposite ways, which is what a hill between them means.
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const { paths } = layoutResort(ITEMS, plan);
    const turns = new Set(
      paths.filter((tile) => tile.id === STAIRS_ID).map((tile) => tile.rotation),
    );
    expect(turns.has(0)).toBe(true);
    expect(turns.has(2)).toBe(true);
  });

  it('runs a walk along the benches, at several heights up the hill', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const elevation = elevationFor(plan)!;
    const { paths } = layoutResort(ITEMS, plan);
    // Paving per height it stands at. A walk down the middle of a bench is about
    // as many tiles as the plot is wide — spread over a few rows, because it
    // follows the coast rather than a line — where a lane climbing the hill head
    // on leaves a handful at each height it passes through.
    const perLevel = new Map<number, number>();
    for (const tile of paths) {
      const level = levelAt(elevation, tile.tileX, tile.tileZ);
      perLevel.set(level, (perLevel.get(level) ?? 0) + 1);
    }
    const walked = [...perLevel.entries()].filter(
      ([level, tiles]) => level > 0 && tiles > plan.tilesX * 0.6,
    );
    // The shelf on top of the dune and the grass benches above it: a hill you
    // can walk along at four heights rather than only climb.
    expect(walked.length).toBeGreaterThanOrEqual(4);
  });

  it('rails the walks along the top of a step and the flights between them', () => {
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const { rails, paths } = layoutResort(ITEMS, plan);
    const paved = new Set(paths.map((tile) => tileKey(tile.tileX, tile.tileZ)));

    expect(rails.some((rail) => rail.id === RAILING_ID)).toBe(true);
    expect(rails.some((rail) => rail.id === STAIR_RAILING_ID)).toBe(true);
    // A rail stands on the paving it guards rather than on ground of its own.
    for (const rail of rails) {
      expect({ key: rail.key, on: paved.has(tileKey(rail.tileX, rail.tileZ)) }).toEqual({
        key: rail.key,
        on: true,
      });
    }
    // And they are the exception, like the flights: a hill with a handrail down
    // every path on it would be a fire escape.
    expect(rails.length).toBeLessThan(paths.length / 8);
  });

  it('lays a flight where a path crosses a step and nowhere else', () => {
    // Stairs are the exception, not the paving: a dozen or two on a plot that
    // lays a few thousand slabs.
    const plan = generateResort(TYPES, params({ tilesX: 112, tilesZ: 100 }));
    const { paths } = layoutResort(ITEMS, plan);
    const stairs = paths.filter((tile) => tile.id === STAIRS_ID).length;
    expect(stairs).toBeGreaterThan(5);
    expect(stairs).toBeLessThan(paths.length / 8);
  });
});
