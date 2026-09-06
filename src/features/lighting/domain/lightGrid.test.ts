import { describe, expect, it } from "vitest";
import type { LightAnchor } from "./lightAnchors";
import {
  bakeLightGrid,
  cellCount,
  DEFAULT_GRID_BUDGET_BYTES,
  FINEST_CELL_SIZE,
  gridByteSize,
  gridSpecAt,
  lightGridSpecFor,
  linearRgbOf,
  luminance,
  pointLightAttenuation,
  srgbToLinear,
  type LightGridSpec,
} from "./lightGrid";

const anchor = (overrides: Partial<LightAnchor> = {}): LightAnchor => ({
  key: "lamp",
  x: 0,
  y: 0,
  z: 0,
  color: 0xffffff,
  intensity: 100,
  distance: 40,
  ...overrides,
});

/** Undoes the bake's square-root encoding of one channel. */
const decodeChannel = (byte: number, scale: number): number => (byte / 255) ** 2 * scale;

/** Maps an encoded direction byte back onto -1..1. */
const decodeAxis = (byte: number): number => (byte / 255) * 2 - 1;

/** Decodes one cell's irradiance back to the linear RGB the bake was given. */
function irradianceAt(
  grid: ReturnType<typeof bakeLightGrid>,
  ix: number,
  iy: number,
  iz: number,
): [number, number, number] {
  const { dims } = grid.spec;
  const cell = (ix + dims.x * (iy + dims.y * iz)) * 4;
  return [
    decodeChannel(grid.irradiance[cell]!, grid.scale),
    decodeChannel(grid.irradiance[cell + 1]!, grid.scale),
    decodeChannel(grid.irradiance[cell + 2]!, grid.scale),
  ];
}

function cellFor(spec: LightGridSpec, x: number, y: number, z: number): [number, number, number] {
  return [
    Math.floor((x - spec.origin.x) / spec.cellSize),
    Math.floor((y - spec.origin.y) / spec.cellSize),
    Math.floor((z - spec.origin.z) / spec.cellSize),
  ];
}

describe("srgbToLinear", () => {
  it("pins both ends", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
  });

  it("takes the linear segment near black", () => {
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 10);
  });

  it("darkens mid grey, as the curve must", () => {
    expect(srgbToLinear(0.5)).toBeLessThan(0.5);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140411, 6);
  });
});

describe("linearRgbOf", () => {
  it("splits a packed colour", () => {
    expect(linearRgbOf(0xffffff).map((v) => Math.round(v * 1000))).toEqual([1000, 1000, 1000]);
    expect(linearRgbOf(0x000000)).toEqual([0, 0, 0]);
  });

  it("keeps the channels apart and in order", () => {
    const [r, g, b] = linearRgbOf(0xff8000);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBe(0);
  });
});

describe("pointLightAttenuation", () => {
  it("falls off with the inverse square", () => {
    const near = pointLightAttenuation(4, 0);
    const far = pointLightAttenuation(8, 0);
    expect(near / far).toBeCloseTo(4, 6);
  });

  it("reaches exactly zero at the cutoff, and past it", () => {
    expect(pointLightAttenuation(40, 40)).toBe(0);
    expect(pointLightAttenuation(60, 40)).toBe(0);
  });

  it("is windowed below the cutoff, so it never steps down", () => {
    expect(pointLightAttenuation(39, 40)).toBeGreaterThan(0);
    expect(pointLightAttenuation(39, 40)).toBeLessThan(pointLightAttenuation(20, 40));
  });

  it("clamps the singularity at the lamp itself", () => {
    expect(Number.isFinite(pointLightAttenuation(0, 40))).toBe(true);
  });
});

describe("luminance", () => {
  it("weights green most and blue least", () => {
    expect(luminance(0, 1, 0)).toBeGreaterThan(luminance(1, 0, 0));
    expect(luminance(1, 0, 0)).toBeGreaterThan(luminance(0, 0, 1));
    expect(luminance(1, 1, 1)).toBeCloseTo(1, 6);
  });
});

describe("gridSpecAt", () => {
  it("has nothing to cover without lamps", () => {
    expect(gridSpecAt([], 4)).toBeNull();
  });

  it("covers every lamp's reach", () => {
    const spec = gridSpecAt([anchor({ x: 100, y: 20, z: 100, distance: 40 })], 4)!;
    expect(spec.origin.x).toBeLessThanOrEqual(60);
    expect(spec.origin.z).toBeLessThanOrEqual(60);
    expect(spec.origin.x + spec.dims.x * spec.cellSize).toBeGreaterThanOrEqual(140);
    expect(spec.origin.z + spec.dims.z * spec.cellSize).toBeGreaterThanOrEqual(140);
  });

  it("does not dig below the ground to chase a lamp's reach", () => {
    const spec = gridSpecAt([anchor({ y: 10, distance: 70 })], 4)!;
    expect(spec.origin.y).toBeGreaterThanOrEqual(-2 * spec.cellSize);
  });

  it("leaves a dark border on every side for the sampler to clamp against", () => {
    const anchors = [anchor({ x: 0, y: 12, z: 0, distance: 20 })];
    const spec = gridSpecAt(anchors, 4)!;
    const grid = bakeLightGrid(anchors, spec);
    const { dims } = spec;
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [dims.x - 1, dims.y - 1, dims.z - 1],
      [dims.x - 1, 0, 0],
      [0, 0, dims.z - 1],
    ];
    for (const [ix, iy, iz] of corners) {
      expect(irradianceAt(grid, ix, iy, iz)).toEqual([0, 0, 0]);
    }
  });

  it("grows with the plot, and shrinks as cells get coarser", () => {
    const anchors = [anchor({ x: 0 }), anchor({ key: "far", x: 400 })];
    const fine = gridSpecAt(anchors, 4)!;
    const coarse = gridSpecAt(anchors, 8)!;
    expect(cellCount(coarse)).toBeLessThan(cellCount(fine));
    expect(gridByteSize(fine)).toBe(cellCount(fine) * 8);
  });
});

describe("lightGridSpecFor", () => {
  /** A plot of `span` voxels a side, lit on a regular grid of street lamps. */
  const plotOf = (span: number): LightAnchor[] => {
    const lamps: LightAnchor[] = [];
    for (let x = 0; x < span; x += 80) {
      for (let z = 0; z < span; z += 80) {
        lamps.push(anchor({ key: `lamp-${x}-${z}`, x, y: 18, z, distance: 46 }));
      }
    }
    return lamps;
  };

  it("has nothing to cover without lamps", () => {
    expect(lightGridSpecFor([])).toBeNull();
  });

  it("bakes this plot at the finest cell size", () => {
    expect(lightGridSpecFor(plotOf(960))?.cellSize).toBe(FINEST_CELL_SIZE);
  });

  it("never goes finer than the finest cell size", () => {
    expect(lightGridSpecFor(plotOf(200))?.cellSize).toBe(FINEST_CELL_SIZE);
  });

  it("coarsens rather than blowing the budget on a bigger resort", () => {
    for (const span of [960, 2880, 5760, 12_000]) {
      const spec = lightGridSpecFor(plotOf(span))!;
      expect(gridByteSize(spec)).toBeLessThanOrEqual(DEFAULT_GRID_BUDGET_BYTES);
    }
  });

  it("takes coarser cells the larger the plot gets", () => {
    const small = lightGridSpecFor(plotOf(960))!;
    const large = lightGridSpecFor(plotOf(5760))!;
    expect(large.cellSize).toBeGreaterThan(small.cellSize);
  });

  it("honours a tighter budget", () => {
    const spec = lightGridSpecFor(plotOf(960), 1024 * 1024)!;
    expect(gridByteSize(spec)).toBeLessThanOrEqual(1024 * 1024);
    expect(spec.cellSize).toBeGreaterThan(FINEST_CELL_SIZE);
  });
});

describe("bakeLightGrid", () => {
  it("leaves the whole grid dark when nothing burns", () => {
    const spec = gridSpecAt([anchor()], 4)!;
    const grid = bakeLightGrid([anchor({ intensity: 0 })], spec);
    expect(grid.scale).toBe(0);
    expect(grid.litCells).toBe(0);
    expect([...grid.irradiance].every((byte) => byte === 0)).toBe(true);
  });

  it("is brightest at the lamp and fades outward", () => {
    const anchors = [anchor({ x: 0, y: 20, z: 0, distance: 40 })];
    const spec = gridSpecAt(anchors, 4)!;
    const grid = bakeLightGrid(anchors, spec);

    const near = irradianceAt(grid, ...cellFor(spec, 0, 20, 0));
    const middle = irradianceAt(grid, ...cellFor(spec, 16, 20, 0));
    const outside = irradianceAt(grid, ...cellFor(spec, 0, 20, 39));
    expect(near[0]).toBeGreaterThan(middle[0]);
    expect(middle[0]).toBeGreaterThan(outside[0]);
  });

  it("stops exactly at the lamp's declared distance", () => {
    const anchors = [anchor({ x: 0, y: 20, z: 0, distance: 40 })];
    const spec = gridSpecAt(anchors, 4)!;
    const grid = bakeLightGrid(anchors, spec);
    // 43 voxels out is still inside the grid, and past the lamp's 40.
    expect(irradianceAt(grid, ...cellFor(spec, 0, 20, 43))).toEqual([0, 0, 0]);
  });

  it("keeps a lamp's colour", () => {
    const anchors = [anchor({ x: 0, y: 20, z: 0, color: 0xff0000 })];
    const spec = gridSpecAt(anchors, 4)!;
    const grid = bakeLightGrid(anchors, spec);
    const [r, g, b] = irradianceAt(grid, ...cellFor(spec, 0, 20, 0));
    expect(r).toBeGreaterThan(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it("adds two lamps reaching the same cell", () => {
    const middle = { y: 20, z: 0 };
    const one = [anchor({ key: "a", x: -10, ...middle })];
    const both = [...one, anchor({ key: "b", x: 10, ...middle })];
    const spec = gridSpecAt(both, 4)!;
    const lit = bakeLightGrid(one, spec);
    const brighter = bakeLightGrid(both, spec);
    const cell = cellFor(spec, 0, 20, 0);
    expect(brighter.scale).toBeGreaterThan(0);
    // Compare in absolute terms: the two bakes normalise against their own peak.
    expect(irradianceAt(brighter, ...cell)[0]).toBeGreaterThan(irradianceAt(lit, ...cell)[0] * 1.5);
  });

  describe("direction", () => {
    const readDirection = (
      grid: ReturnType<typeof bakeLightGrid>,
      cell: readonly [number, number, number],
    ): { direction: [number, number, number]; agreement: number } => {
      const { dims } = grid.spec;
      const index = (cell[0] + dims.x * (cell[1] + dims.y * cell[2])) * 4;
      return {
        direction: [
          decodeAxis(grid.direction[index]!),
          decodeAxis(grid.direction[index + 1]!),
          decodeAxis(grid.direction[index + 2]!),
        ],
        agreement: grid.irradiance[index + 3]! / 255,
      };
    };

    it("points at the one lamp that reaches the cell, and agrees fully", () => {
      const anchors = [anchor({ x: 0, y: 40, z: 0, distance: 60 })];
      const spec = gridSpecAt(anchors, 4)!;
      const grid = bakeLightGrid(anchors, spec);
      const { direction, agreement } = readDirection(grid, cellFor(spec, 0, 4, 0));
      // The lamp is straight up from this cell.
      expect(direction[1]).toBeGreaterThan(0.9);
      expect(Math.abs(direction[0])).toBeLessThan(0.15);
      expect(agreement).toBeGreaterThan(0.95);
    });

    it("mostly cancels between two opposed lamps, so the cell shades flatly", () => {
      const west = anchor({ key: "west", x: -20, y: 8, z: 0, distance: 60 });
      const east = anchor({ key: "east", x: 20, y: 8, z: 0, distance: 60 });
      const spec = gridSpecAt([west, east], 4)!;
      const cell = cellFor(spec, 0, 8, 0);
      const alone = readDirection(bakeLightGrid([west], spec), cell).agreement;
      const opposed = readDirection(bakeLightGrid([west, east], spec), cell).agreement;
      expect(alone).toBeGreaterThan(0.95);
      expect(opposed).toBeLessThan(0.35);
    });
  });

  it("bakes this resort's worth of lamps in well under a second", () => {
    // 85 anchors is what the current plot yields; the bake must stay a load-time
    // cost, not a reason to add a loading screen.
    const anchors = Array.from({ length: 85 }, (_, index) =>
      anchor({
        key: `lamp-${index}`,
        x: (index % 12) * 80,
        y: 18,
        z: Math.floor(index / 12) * 80,
        distance: 46,
      }),
    );
    const spec = lightGridSpecFor(anchors)!;
    const started = performance.now();
    const grid = bakeLightGrid(anchors, spec);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(grid.litCells).toBeGreaterThan(0);
  });
});
