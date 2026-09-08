import { describe, expect, it } from "vitest";
import { OBJECT_TYPES } from "../../catalog/domain/objectTypes";
import { layoutItemFor } from "../../build/domain/buildPlan";
import { layoutResort, streetTiles, tileKey } from "./resortLayout";
import { HEDGE_ID, LAMP_ID, PATH_ID } from "./resortPlan";
import {
  clampParams,
  createRandom,
  emptyResortPlan,
  generateResort,
  PLOT_DENSITY,
  PLOT_TILES,
  type GeneratorType,
  type ResortParams,
} from "./resortGenerator";

const TYPES: GeneratorType[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  category: type.category,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
}));

const ITEMS = OBJECT_TYPES.map(layoutItemFor);

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

describe("createRandom", () => {
  it("gives the same run twice for the same seed", () => {
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it("stays inside the unit interval", () => {
    const drawn = Array.from({ length: 500 }, createRandom(3));
    expect(Math.min(...drawn)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drawn)).toBeLessThan(1);
  });

  it("spreads over the interval rather than sticking near one end", () => {
    const drawn = Array.from({ length: 2000 }, createRandom(11));
    const mean = drawn.reduce((sum, value) => sum + value, 0) / drawn.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe("clampParams", () => {
  it("pulls a plot too small up to the smallest one that works", () => {
    expect(clampParams(params({ tilesX: 4, tilesZ: 4 }))).toMatchObject({
      tilesX: PLOT_TILES.min,
      tilesZ: PLOT_TILES.min,
    });
  });

  it("pulls a plot too large down to what is worth baking", () => {
    expect(clampParams(params({ tilesX: 5000, tilesZ: 5000 }))).toMatchObject({
      tilesX: PLOT_TILES.max,
      tilesZ: PLOT_TILES.max,
    });
  });

  it("keeps density in range and the seed a whole number", () => {
    expect(clampParams(params({ density: 5 })).density).toBe(PLOT_DENSITY.max);
    expect(clampParams(params({ density: -1 })).density).toBe(PLOT_DENSITY.min);
    expect(clampParams(params({ seed: -7.8 })).seed).toBe(7);
  });

  it("rounds a fractional plot size to whole tiles", () => {
    expect(clampParams(params({ tilesX: 80.6 })).tilesX).toBe(81);
  });
});

describe("generateResort", () => {
  it("is a pure function of its parameters", () => {
    expect(generateResort(TYPES, params())).toEqual(generateResort(TYPES, params()));
  });

  it("gives a different resort for a different seed", () => {
    const one = generateResort(TYPES, params({ seed: 1 }));
    const other = generateResort(TYPES, params({ seed: 2 }));
    expect(one.plots).not.toEqual(other.plots);
  });

  it("builds more on a denser plot", () => {
    const sparse = generateResort(TYPES, params({ density: PLOT_DENSITY.min }));
    const packed = generateResort(TYPES, params({ density: PLOT_DENSITY.max }));
    expect(packed.plots.length).toBeGreaterThan(sparse.plots.length * 1.5);
  });

  it("builds more on a bigger plot", () => {
    const small = generateResort(TYPES, params({ tilesX: 48, tilesZ: 48 }));
    const large = generateResort(TYPES, params({ tilesX: 144, tilesZ: 144 }));
    expect(large.plots.length).toBeGreaterThan(small.plots.length);
  });

  it("never places an object the layout scatters for itself", () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      for (const plot of plan.plots) {
        expect([PATH_ID, LAMP_ID, HEDGE_ID]).not.toContain(plot.id);
      }
    }
  });

  it("stands the whole catalogue, at every size and density it offers", () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const planted = new Set(plan.plots.map((plot) => plot.id));
      const owed = TYPES.filter(
        (type) => ![PATH_ID, LAMP_ID, HEDGE_ID].includes(type.id) && !planted.has(type.id),
      );
      expect({ set, missing: owed.map((type) => type.id) }).toEqual({ set, missing: [] });
      expect(plan.standsWholeCatalogue).toBe(true);
    }
  });

  it("keeps every object inside the plot", () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const byId = new Map(TYPES.map((type) => [type.id, type]));
      for (const plot of plan.plots) {
        const type = byId.get(plot.id)!;
        expect(plot.tileX).toBeGreaterThanOrEqual(0);
        expect(plot.tileZ).toBeGreaterThanOrEqual(0);
        expect(plot.tileX + type.tilesX).toBeLessThanOrEqual(plan.tilesX);
        expect(plot.tileZ + type.tilesZ).toBeLessThanOrEqual(plan.tilesZ);
      }
    }
  });

  it("never overlaps two objects", () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      const byId = new Map(TYPES.map((type) => [type.id, type]));
      const taken = new Set<string>();
      for (const plot of plan.plots) {
        const type = byId.get(plot.id)!;
        for (let z = plot.tileZ; z < plot.tileZ + type.tilesZ; z++) {
          for (let x = plot.tileX; x < plot.tileX + type.tilesX; x++) {
            expect(taken.has(tileKey(x, z))).toBe(false);
            taken.add(tileKey(x, z));
          }
        }
      }
    }
  });

  it("routes streets that stay on the plot", () => {
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      expect(() => streetTiles(plan)).not.toThrow();
      expect(streetTiles(plan).length).toBeGreaterThan(0);
    }
  });

  it("produces a plan the layout accepts, at every size, seed and density", () => {
    // The one that matters: `layoutResort` throws on an overlap, an object off
    // the plot, an unknown type, or an object it cannot grow a spur from. A
    // generator that satisfies it has satisfied every invariant the hand-written
    // plan is held to.
    for (const set of SWEEP) {
      const plan = generateResort(TYPES, set);
      expect(() => layoutResort(ITEMS, plan)).not.toThrow();
    }
  });

  it("lays paths, lamps and hedges out around what it generated", () => {
    const layout = layoutResort(ITEMS, generateResort(TYPES, params()));
    expect(layout.paths.length).toBeGreaterThan(0);
    expect(layout.props.some((prop) => prop.id === LAMP_ID)).toBe(true);
    expect(layout.props.some((prop) => prop.id === HEDGE_ID)).toBe(true);
  });
});

describe("emptyResortPlan", () => {
  it("has nothing on it", () => {
    const plan = emptyResortPlan(80, 80);
    expect(plan.plots).toEqual([]);
    expect(plan.nodes).toEqual([]);
    expect(plan.edges).toEqual([]);
    expect(plan.plazas).toEqual([]);
  });

  it("does not claim to stand the catalogue, so the layout lets it be empty", () => {
    expect(emptyResortPlan(80, 80).standsWholeCatalogue).toBe(false);
    const layout = layoutResort(ITEMS, emptyResortPlan(80, 80));
    expect(layout.placements).toEqual([]);
    expect(layout.paths).toEqual([]);
    expect(layout.props).toEqual([]);
  });

  it("keeps its size, clamped to what the generator will work at", () => {
    expect(emptyResortPlan(64, 72)).toMatchObject({ tilesX: 64, tilesZ: 72 });
    expect(emptyResortPlan(1, 1)).toMatchObject({ tilesX: PLOT_TILES.min, tilesZ: PLOT_TILES.min });
  });
});
