import { describe, expect, it } from 'vitest';
import type { LightAnchor } from './lightAnchors';
import {
  bakeLightGrid,
  cellCount,
  countRegion,
  DEFAULT_GRID_BUDGET_BYTES,
  FINEST_CELL_SIZE,
  gridByteSize,
  gridInterior,
  gridSpecAt,
  lightGridSpecFor,
  linearRgbOf,
  luminance,
  pointLightAttenuation,
  rangeCells,
  rangeDims,
  reachOf,
  rebakeRegion,
  SCALE_HEADROOM,
  srgbToLinear,
  wholeGrid,
  type LightGridSpec,
} from './lightGrid';

const anchor = (overrides: Partial<LightAnchor> = {}): LightAnchor => ({
  key: 'lamp',
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

/** One cell's four raw irradiance bytes, before any decoding. */
function bytesAt(
  grid: ReturnType<typeof bakeLightGrid>,
  [ix, iy, iz]: readonly [number, number, number],
): Uint8Array {
  const { dims } = grid.spec;
  const cell = (ix + dims.x * (iy + dims.y * iz)) * 4;
  return grid.irradiance.slice(cell, cell + 4);
}

function cellFor(spec: LightGridSpec, x: number, y: number, z: number): [number, number, number] {
  return [
    Math.floor((x - spec.origin.x) / spec.cellSize),
    Math.floor((y - spec.origin.y) / spec.cellSize),
    Math.floor((z - spec.origin.z) / spec.cellSize),
  ];
}

describe('srgbToLinear', () => {
  it('pins both ends', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
  });

  it('takes the linear segment near black', () => {
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 10);
  });

  it('darkens mid grey, as the curve must', () => {
    expect(srgbToLinear(0.5)).toBeLessThan(0.5);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140411, 6);
  });
});

describe('linearRgbOf', () => {
  it('splits a packed colour', () => {
    expect(linearRgbOf(0xffffff).map((v) => Math.round(v * 1000))).toEqual([1000, 1000, 1000]);
    expect(linearRgbOf(0x000000)).toEqual([0, 0, 0]);
  });

  it('keeps the channels apart and in order', () => {
    const [r, g, b] = linearRgbOf(0xff8000);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBe(0);
  });
});

describe('pointLightAttenuation', () => {
  it('falls off with the inverse square', () => {
    const near = pointLightAttenuation(4, 0);
    const far = pointLightAttenuation(8, 0);
    expect(near / far).toBeCloseTo(4, 6);
  });

  it('reaches exactly zero at the cutoff, and past it', () => {
    expect(pointLightAttenuation(40, 40)).toBe(0);
    expect(pointLightAttenuation(60, 40)).toBe(0);
  });

  it('is windowed below the cutoff, so it never steps down', () => {
    expect(pointLightAttenuation(39, 40)).toBeGreaterThan(0);
    expect(pointLightAttenuation(39, 40)).toBeLessThan(pointLightAttenuation(20, 40));
  });

  it('clamps the singularity at the lamp itself', () => {
    expect(Number.isFinite(pointLightAttenuation(0, 40))).toBe(true);
  });
});

describe('luminance', () => {
  it('weights green most and blue least', () => {
    expect(luminance(0, 1, 0)).toBeGreaterThan(luminance(1, 0, 0));
    expect(luminance(1, 0, 0)).toBeGreaterThan(luminance(0, 0, 1));
    expect(luminance(1, 1, 1)).toBeCloseTo(1, 6);
  });
});

describe('gridSpecAt', () => {
  it('has nothing to cover without lamps', () => {
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

  it('leaves a dark border on every side for the sampler to clamp against', () => {
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

  it('grows with the plot, and shrinks as cells get coarser', () => {
    const anchors = [anchor({ x: 0 }), anchor({ key: 'far', x: 400 })];
    const fine = gridSpecAt(anchors, 4)!;
    const coarse = gridSpecAt(anchors, 8)!;
    expect(cellCount(coarse)).toBeLessThan(cellCount(fine));
    expect(gridByteSize(fine)).toBe(cellCount(fine) * 8);
  });
});

describe('lightGridSpecFor', () => {
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

  it('has nothing to cover without lamps', () => {
    expect(lightGridSpecFor([])).toBeNull();
  });

  it('bakes this plot at the finest cell size', () => {
    expect(lightGridSpecFor(plotOf(960))?.cellSize).toBe(FINEST_CELL_SIZE);
  });

  it('never goes finer than the finest cell size', () => {
    expect(lightGridSpecFor(plotOf(200))?.cellSize).toBe(FINEST_CELL_SIZE);
  });

  it('coarsens rather than blowing the budget on a bigger resort', () => {
    for (const span of [960, 2880, 5760, 12_000]) {
      const spec = lightGridSpecFor(plotOf(span))!;
      expect(gridByteSize(spec)).toBeLessThanOrEqual(DEFAULT_GRID_BUDGET_BYTES);
    }
  });

  it('takes coarser cells the larger the plot gets', () => {
    const small = lightGridSpecFor(plotOf(960))!;
    const large = lightGridSpecFor(plotOf(5760))!;
    expect(large.cellSize).toBeGreaterThan(small.cellSize);
  });

  it('honours a tighter budget', () => {
    const spec = lightGridSpecFor(plotOf(960), 1024 * 1024)!;
    expect(gridByteSize(spec)).toBeLessThanOrEqual(1024 * 1024);
    expect(spec.cellSize).toBeGreaterThan(FINEST_CELL_SIZE);
  });
});

describe('bakeLightGrid', () => {
  it('leaves the whole grid dark when nothing burns', () => {
    const spec = gridSpecAt([anchor()], 4)!;
    const grid = bakeLightGrid([anchor({ intensity: 0 })], spec);
    expect(grid.scale).toBe(0);
    expect(grid.litCells).toBe(0);
    expect([...grid.irradiance].every((byte) => byte === 0)).toBe(true);
  });

  it('is brightest at the lamp and fades outward', () => {
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

  it('adds two lamps reaching the same cell', () => {
    const middle = { y: 20, z: 0 };
    const one = [anchor({ key: 'a', x: -10, ...middle })];
    const both = [...one, anchor({ key: 'b', x: 10, ...middle })];
    const spec = gridSpecAt(both, 4)!;
    const lit = bakeLightGrid(one, spec);
    const brighter = bakeLightGrid(both, spec);
    const cell = cellFor(spec, 0, 20, 0);
    expect(brighter.scale).toBeGreaterThan(0);
    // Compare in absolute terms: the two bakes normalise against their own peak.
    expect(irradianceAt(brighter, ...cell)[0]).toBeGreaterThan(irradianceAt(lit, ...cell)[0] * 1.5);
  });

  describe('direction', () => {
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

    it('points at the one lamp that reaches the cell, and agrees fully', () => {
      const anchors = [anchor({ x: 0, y: 40, z: 0, distance: 60 })];
      const spec = gridSpecAt(anchors, 4)!;
      const grid = bakeLightGrid(anchors, spec);
      const { direction, agreement } = readDirection(grid, cellFor(spec, 0, 4, 0));
      // The lamp is straight up from this cell.
      expect(direction[1]).toBeGreaterThan(0.9);
      expect(Math.abs(direction[0])).toBeLessThan(0.15);
      expect(agreement).toBeGreaterThan(0.95);
    });

    it('mostly cancels between two opposed lamps, so the cell shades flatly', () => {
      const west = anchor({ key: 'west', x: -20, y: 8, z: 0, distance: 60 });
      const east = anchor({ key: 'east', x: 20, y: 8, z: 0, distance: 60 });
      const spec = gridSpecAt([west, east], 4)!;
      const cell = cellFor(spec, 0, 8, 0);
      const alone = readDirection(bakeLightGrid([west], spec), cell).agreement;
      const opposed = readDirection(bakeLightGrid([west, east], spec), cell).agreement;
      expect(alone).toBeGreaterThan(0.95);
      expect(opposed).toBeLessThan(0.35);
    });
  });

  describe('the encoding scale', () => {
    /** A dim lamp and, far enough away not to reach it, a much brighter one. */
    const west = anchor({ key: 'west', x: -100, y: 20, z: 0, distance: 40, intensity: 100 });
    const east = anchor({ key: 'east', x: 100, y: 20, z: 0, distance: 40, intensity: 400 });
    const spec = gridSpecAt([west, east], 4)!;
    const westCell = cellFor(spec, -100, 20, 0);

    it('leaves room above the brightest cell', () => {
      const grid = bakeLightGrid([west], spec);
      // Colour only: the fourth byte is the agreement term, not irradiance.
      let brightest = 0;
      for (let cell = 0; cell < cellCount(spec); cell++) {
        for (let channel = 0; channel < 3; channel++) {
          brightest = Math.max(brightest, grid.irradiance[cell * 4 + channel]!);
        }
      }
      expect(brightest).toBe(Math.round(Math.sqrt(1 / SCALE_HEADROOM) * 255));
    });

    it('re-encodes the whole grid when each bake measures its own scale', () => {
      // The behaviour that made incremental baking impossible: the west lamp has
      // not changed, and its bytes move anyway, because a brighter lamp arrived
      // somewhere else entirely.
      const alone = bakeLightGrid([west], spec);
      const measured = bakeLightGrid([west, east], spec);
      expect(measured.scale).toBeGreaterThan(alone.scale);
      expect(bytesAt(measured, westCell)).not.toEqual(bytesAt(alone, westCell));
    });

    it('holds every byte a new lamp does not reach, given a scale to keep to', () => {
      const alone = bakeLightGrid([west], spec);
      const fixed = bakeLightGrid([west, east], spec, { scale: alone.scale });

      expect(fixed.scale).toBe(alone.scale);
      expect(bytesAt(fixed, westCell)).toEqual(bytesAt(alone, westCell));
      // Not just the one cell: everything the west lamp lit encodes as before.
      for (let cell = 0; cell < cellCount(spec); cell++) {
        const at = cell * 4;
        if (alone.irradiance[at] === 0 && alone.irradiance[at + 1] === 0) continue;
        expect(alone.irradiance.slice(at, at + 4)).toEqual(fixed.irradiance.slice(at, at + 4));
      }
      // And the east lamp did light its own cells.
      expect(fixed.litCells).toBeGreaterThan(alone.litCells);
    });

    it('clamps what a kept scale cannot hold, and says how much', () => {
      const alone = bakeLightGrid([west], spec);
      expect(alone.clampedCells).toBe(0);
      expect(bakeLightGrid([west, east], spec).clampedCells).toBe(0);
      expect(
        bakeLightGrid([west, east], spec, { scale: alone.scale }).clampedCells,
      ).toBeGreaterThan(0);
    });

    it('measures as usual when handed a scale of nothing', () => {
      const measured = bakeLightGrid([west], spec);
      expect(bakeLightGrid([west], spec, { scale: 0 }).scale).toBe(measured.scale);
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

describe('cell ranges', () => {
  const spec = gridSpecAt([anchor()], 4)!;

  it('counts the whole grid', () => {
    expect(rangeCells(wholeGrid(spec))).toBe(cellCount(spec));
    expect(rangeDims(wholeGrid(spec))).toEqual(spec.dims);
  });

  it('counts an empty range as holding nothing', () => {
    expect(rangeCells({ lowX: 4, highX: 3, lowY: 0, highY: 0, lowZ: 0, highZ: 0 })).toBe(0);
  });

  it('holds the interior back from every wall the sampler clamps against', () => {
    const interior = gridInterior(spec);
    expect(interior.lowX).toBe(1);
    expect(interior.lowZ).toBe(1);
    expect(interior.highX).toBe(spec.dims.x - 2);
    expect(interior.highZ).toBe(spec.dims.z - 2);
    expect(interior.highY).toBe(spec.dims.y - 2);
    // Except the floor: nothing samples below the ground, and the lamps
    // standing at load light that layer too.
    expect(interior.lowY).toBe(0);
  });
});

describe('reachOf', () => {
  const spec = gridSpecAt([anchor({ x: 0, y: 20, z: 0, distance: 40 })], 4)!;

  it("spans the lamp's falloff and no more", () => {
    const range = reachOf(anchor({ x: 0, y: 20, z: 0, distance: 40 }), spec, wholeGrid(spec));
    const dims = rangeDims(range);
    // Eighty voxels across at four to the cell, plus a cell of rounding at each end.
    expect(dims.x).toBeLessThanOrEqual(80 / 4 + 2);
    expect(dims.z).toBeLessThanOrEqual(80 / 4 + 2);
  });

  it('grows with the falloff distance', () => {
    const near = reachOf(anchor({ distance: 20 }), spec, wholeGrid(spec));
    const far = reachOf(anchor({ distance: 40 }), spec, wholeGrid(spec));
    expect(rangeCells(far)).toBeGreaterThan(rangeCells(near));
  });

  it('clips to the window it is given', () => {
    const window = { lowX: 5, highX: 6, lowY: 0, highY: 1, lowZ: 5, highZ: 6 };
    const range = reachOf(anchor({ distance: 400 }), spec, window);
    expect(range).toEqual(window);
  });

  it('is empty for a lamp that reaches nothing in the window', () => {
    const far = anchor({ x: 10_000, z: 10_000, distance: 10 });
    expect(rangeCells(reachOf(far, spec, wholeGrid(spec)))).toBe(0);
  });
});

describe('countRegion', () => {
  const anchors = [anchor({ x: 0, y: 20, z: 0, distance: 40 })];
  const spec = gridSpecAt(anchors, 4)!;

  it('agrees with what the bake reported for the whole grid', () => {
    const grid = bakeLightGrid(anchors, spec);
    expect(countRegion(grid.irradiance, spec, wholeGrid(spec))).toEqual({
      litCells: grid.litCells,
      clampedCells: grid.clampedCells,
    });
  });

  it('counts nothing in a corner no lamp reaches', () => {
    const grid = bakeLightGrid(anchors, spec);
    const corner = { lowX: 0, highX: 0, lowY: 0, highY: 0, lowZ: 0, highZ: 0 };
    expect(countRegion(grid.irradiance, spec, corner).litCells).toBe(0);
  });
});

describe('rebakeRegion', () => {
  const west = anchor({ key: 'west', x: -60, y: 20, z: 0, distance: 40 });
  const east = anchor({ key: 'east', x: 60, y: 20, z: 0, distance: 40 });
  const spec = gridSpecAt([west, east], 4)!;

  /** A grid holding only the west lamp, with the east lamp's block re-baked in. */
  const rebakeInto = (grid: ReturnType<typeof bakeLightGrid>, anchors: readonly LightAnchor[]) =>
    rebakeRegion({
      anchors,
      spec,
      range: reachOf(east, spec, wholeGrid(spec)),
      scale: grid.scale,
      irradiance: grid.irradiance,
      direction: grid.direction,
    });

  it('writes what a whole-grid bake at the same scale would have written', () => {
    const partial = bakeLightGrid([west], spec);
    rebakeInto(partial, [west, east]);
    const whole = bakeLightGrid([west, east], spec, { scale: partial.scale });
    expect(partial.irradiance).toEqual(whole.irradiance);
    expect(partial.direction).toEqual(whole.direction);
  });

  it('leaves every cell outside the range alone', () => {
    const partial = bakeLightGrid([west], spec);
    const before = partial.irradiance.slice();
    const range = reachOf(east, spec, wholeGrid(spec));
    rebakeInto(partial, [west, east]);

    const westCell = (ix: number, iy: number, iz: number) =>
      (ix + spec.dims.x * (iy + spec.dims.y * iz)) * 4;
    for (let iz = 0; iz < spec.dims.z; iz++) {
      for (let iy = 0; iy < spec.dims.y; iy++) {
        for (let ix = 0; ix < range.lowX; ix++) {
          const at = westCell(ix, iy, iz);
          expect(partial.irradiance.slice(at, at + 4)).toEqual(before.slice(at, at + 4));
        }
      }
    }
  });

  it('takes a lamp away as exactly as it put one there', () => {
    const both = bakeLightGrid([west, east], spec);
    const expected = bakeLightGrid([west], spec, { scale: both.scale });
    rebakeInto(both, [west]);
    expect(both.irradiance).toEqual(expected.irradiance);
    expect(both.direction).toEqual(expected.direction);
  });

  it('does nothing at all for an empty range', () => {
    const grid = bakeLightGrid([west], spec);
    const before = grid.irradiance.slice();
    rebakeRegion({
      anchors: [west, east],
      spec,
      range: { lowX: 4, highX: 3, lowY: 0, highY: 0, lowZ: 0, highZ: 0 },
      scale: grid.scale,
      irradiance: grid.irradiance,
      direction: grid.direction,
    });
    expect(grid.irradiance).toEqual(before);
  });

  it('measures a scale when it is given none', () => {
    const grid = bakeLightGrid([], spec);
    expect(grid.scale).toBe(0);
    const baked = rebakeInto(grid, [east]);
    expect(baked.scale).toBeGreaterThan(0);
  });
});

/**
 * The bake as it was written first: one pass over every cell in the grid.
 *
 * Kept here rather than in the module because it is not how the bake runs any
 * more — it is what the scoped bake has to agree with, byte for byte, and a
 * reference you can read in twenty lines is worth more than a golden blob.
 */
function referenceBake(anchors: readonly LightAnchor[], spec: LightGridSpec, scale = 0) {
  const count = cellCount(spec);
  const irradiance = new Uint8Array(count * 4);
  const direction = new Uint8Array(count * 4);
  direction.fill(255);
  const range = wholeGrid(spec);
  const baked = rebakeRegion({ anchors, spec, range, scale, irradiance, direction });
  return { irradiance, direction, scale: baked.scale, ...countRegion(irradiance, spec, range) };
}

describe('bakeLightGrid against a bake of every cell', () => {
  /** A grid wide enough that lamps at its far ends leave most of it untouched. */
  const spec = gridSpecAt([], 4, {
    minX: -120,
    maxX: 120,
    minY: 0,
    maxY: 48,
    minZ: -40,
    maxZ: 40,
  })!;

  const expectSameBake = (anchors: readonly LightAnchor[], scale?: number) => {
    const baked = bakeLightGrid(anchors, spec, scale === undefined ? {} : { scale });
    const reference = referenceBake(anchors, spec, scale);
    expect(baked.irradiance).toEqual(reference.irradiance);
    expect(baked.direction).toEqual(reference.direction);
    expect(baked.scale).toBe(reference.scale);
    expect(baked.litCells).toBe(reference.litCells);
    expect(baked.clampedCells).toBe(reference.clampedCells);
    return baked;
  };

  it('keeps the test grid small', () => {
    expect(cellCount(spec)).toBeLessThan(20_000);
  });

  it('agrees for one lamp', () => {
    expect(expectSameBake([anchor({ x: 10, y: 16, z: 4, distance: 30 })]).litCells).toBeGreaterThan(
      0,
    );
  });

  it('agrees for lamps whose reach overlaps', () => {
    // Different intensities, so a scale measured per block would differ from the
    // global one in every block but the brightest.
    expectSameBake([
      anchor({ key: 'a', x: -12, y: 16, z: 0, distance: 30, intensity: 60, color: 0xffcc88 }),
      anchor({ key: 'b', x: 6, y: 20, z: 8, distance: 36, intensity: 240, color: 0x88ccff }),
      anchor({ key: 'c', x: 18, y: 10, z: -10, distance: 24, intensity: 120 }),
    ]);
  });

  it('agrees for lamps far apart, leaving most of the grid unbaked', () => {
    const grid = expectSameBake([
      anchor({ key: 'west', x: -100, y: 16, z: 0, distance: 16 }),
      anchor({ key: 'east', x: 100, y: 16, z: 0, distance: 16, intensity: 300 }),
    ]);
    expect(grid.litCells).toBeLessThan(cellCount(spec) / 10);
  });

  it('agrees with no lamps at all', () => {
    expect(expectSameBake([]).litCells).toBe(0);
  });

  it('agrees when lamps that give no light are mixed in', () => {
    expectSameBake([
      anchor({ key: 'dark', x: 0, y: 16, z: 0, intensity: 0 }),
      anchor({ key: 'real', x: 20, y: 16, z: 0, distance: 30 }),
      anchor({ key: 'point', x: -20, y: 16, z: 0, distance: 0 }),
    ]);
  });

  it('agrees when a lamp reaches nothing inside the grid', () => {
    expectSameBake([
      anchor({ key: 'far', x: 10_000, y: 16, z: 10_000, distance: 40 }),
      anchor({ key: 'near', x: 0, y: 16, z: 0, distance: 20 }),
    ]);
  });

  it('agrees when handed a scale, and keeps to it', () => {
    const anchors = [
      anchor({ key: 'a', x: -12, y: 16, z: 0, distance: 30 }),
      anchor({ key: 'b', x: 6, y: 20, z: 8, distance: 36, intensity: 900 }),
    ];
    expect(expectSameBake(anchors, 3).scale).toBe(3);
    expect(expectSameBake(anchors, 3).clampedCells).toBeGreaterThan(0);
  });
});

describe('a reserved box', () => {
  const lamps = [anchor({ x: 0, y: 20, z: 0, distance: 40 })];

  it('stretches the grid to cover ground no lamp reaches', () => {
    const reserve = { minX: -400, maxX: 400, minY: 0, maxY: 60, minZ: -400, maxZ: 400 };
    const spec = gridSpecAt(lamps, 4, reserve)!;
    expect(spec.origin.x).toBeLessThanOrEqual(-400);
    expect(spec.origin.z).toBeLessThanOrEqual(-400);
    expect(spec.origin.x + spec.dims.x * spec.cellSize).toBeGreaterThanOrEqual(400);
    expect(spec.origin.z + spec.dims.z * spec.cellSize).toBeGreaterThanOrEqual(400);
  });

  it('never shrinks the grid below the lamps standing on it', () => {
    const tight = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
    expect(gridSpecAt(lamps, 4, tight)).toEqual(gridSpecAt(lamps, 4));
  });

  it('is enough on its own to make a grid for a plot with no lamps yet', () => {
    const reserve = { minX: -100, maxX: 100, minY: 0, maxY: 60, minZ: -100, maxZ: 100 };
    expect(gridSpecAt([], 4, reserve)).not.toBeNull();
    expect(gridSpecAt([], 4)).toBeNull();
  });

  it('coarsens with the budget like everything else the grid has to cover', () => {
    const reserve = { minX: -4000, maxX: 4000, minY: 0, maxY: 200, minZ: -4000, maxZ: 4000 };
    const spec = lightGridSpecFor(lamps, DEFAULT_GRID_BUDGET_BYTES, reserve)!;
    expect(gridByteSize(spec)).toBeLessThanOrEqual(DEFAULT_GRID_BUDGET_BYTES);
    expect(spec.cellSize).toBeGreaterThan(FINEST_CELL_SIZE);
  });
});
