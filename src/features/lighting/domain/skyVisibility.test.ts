import { describe, expect, it } from 'vitest';
import {
  bakeLightGrid,
  gridInterior,
  gridSpecAt,
  wholeGrid,
  type LightGridSpec,
} from './lightGrid';
import {
  bakeSkyVisibility,
  createLiveSkyVisibility,
  MAX_OCCLUDER_REACH,
  MIN_OCCLUDER_HEIGHT,
  obscuranceAt,
  occluderRange,
  occludes,
  occluderReach,
  SKY_VISIBILITY_FLOOR,
  visibilityOf,
  type Occluder,
} from './skyVisibility';

const box = (overrides: Partial<Occluder> = {}): Occluder => ({
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 16,
  maxY: 32,
  maxZ: 16,
  density: 0.5,
  ...overrides,
});

/** A grid over a fixed block of world, so cells map to voxels predictably. */
const specOver = (cellSize = 4): LightGridSpec =>
  gridSpecAt([], cellSize, { minX: -64, maxX: 128, minY: 0, maxY: 96, minZ: -64, maxZ: 128 })!;

/** Reads a cell's baked visibility back off the alpha channel. */
function visibilityAt(
  direction: Uint8Array,
  spec: LightGridSpec,
  x: number,
  y: number,
  z: number,
): number {
  const index = (world: number, origin: number): number =>
    Math.floor((world - origin) / spec.cellSize);
  const ix = index(x, spec.origin.x);
  const iy = index(y, spec.origin.y);
  const iz = index(z, spec.origin.z);
  return direction[(ix + spec.dims.x * (iy + spec.dims.y * iz)) * 4 + 3]! / 255;
}

/** The first bake as it was written: one pass over every interior cell. */
function referenceSkyBake(spec: LightGridSpec, occluders: readonly Occluder[]): Uint8Array {
  const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
  const standing = occluders.filter(occludes);
  bakeSkyVisibility({ occluders: standing, spec, range: gridInterior(spec), direction });
  return direction;
}

/** Bakes `occluders` the way the app does, and holds it to the reference byte for byte. */
function expectSameBake(occluders: readonly Occluder[]): Uint8Array {
  const spec = specOver();
  const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
  createLiveSkyVisibility(spec, direction, occluders);
  expect(direction).toEqual(referenceSkyBake(spec, occluders));
  return direction;
}

describe('occludes', () => {
  it('ignores anything lying flat on the ground', () => {
    expect(occludes(box({ maxY: MIN_OCCLUDER_HEIGHT - 1 }))).toBe(false);
    expect(occludes(box({ maxY: MIN_OCCLUDER_HEIGHT }))).toBe(true);
  });

  it('ignores a box nothing fills', () => {
    expect(occludes(box({ density: 0 }))).toBe(false);
  });
});

describe('occluderReach', () => {
  it('gives a sparse pole far less reach than a solid block of the same size', () => {
    const pole = occluderReach(box({ density: 0.03 }));
    const block = occluderReach(box({ density: 0.9 }));
    expect(pole).toBeLessThan(block);
    expect(pole).toBeGreaterThan(0);
  });

  it('caps what a large building reaches', () => {
    const hotel = box({ maxX: 96, maxY: 60, maxZ: 64, density: 0.6 });
    expect(occluderReach(hotel)).toBe(MAX_OCCLUDER_REACH);
  });

  it('is zero for anything that does not occlude', () => {
    expect(occluderReach(box({ maxY: 2 }))).toBe(0);
  });
});

describe('obscuranceAt', () => {
  it('falls away with distance', () => {
    const near = obscuranceAt(box(), 32, 2, 8);
    const far = obscuranceAt(box(), 96, 2, 8);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it('shades the ground beside a wall but not the roof above it', () => {
    const building = box({ maxX: 64, maxY: 48, maxZ: 64, density: 0.8 });
    const beside = obscuranceAt(building, 80, 2, 32);
    const above = obscuranceAt(building, 32, 72, 32);
    expect(beside).toBeGreaterThan(0.1);
    expect(above).toBe(0);
  });

  it('counts a wide canopy overhead more than a narrow trunk', () => {
    const canopy = box({ minY: 32, maxY: 44, maxX: 48, maxZ: 48, density: 0.4 });
    const trunk = box({ minX: 20, maxX: 28, minZ: 20, maxZ: 28, maxY: 44, density: 0.4 });
    expect(obscuranceAt(canopy, 24, 2, 24)).toBeGreaterThan(obscuranceAt(trunk, 24, 2, 24));
  });

  it('saturates rather than exploding on a cell inside the box', () => {
    expect(obscuranceAt(box(), 8, 16, 8)).toBe(1);
  });
});

describe('visibilityOf', () => {
  it('leaves open sky untouched', () => {
    expect(visibilityOf(0)).toBe(1);
  });

  it('never falls through the floor, however much piles up', () => {
    expect(visibilityOf(1000)).toBeGreaterThan(SKY_VISIBILITY_FLOOR);
    expect(visibilityOf(1000)).toBeLessThan(SKY_VISIBILITY_FLOOR + 0.01);
  });

  it('is monotonic', () => {
    expect(visibilityOf(0.5)).toBeLessThan(visibilityOf(0.1));
    expect(visibilityOf(2)).toBeLessThan(visibilityOf(0.5));
  });
});

describe('occluderRange', () => {
  it('covers the box and its reach, and nothing beyond the block it is given', () => {
    const spec = specOver();
    const interior = gridInterior(spec);
    const range = occluderRange(box(), spec, interior);
    expect(range.lowX).toBeGreaterThanOrEqual(interior.lowX);
    expect(range.highX).toBeLessThanOrEqual(interior.highX);
    expect(range.highX - range.lowX).toBeGreaterThan(0);
  });

  it('collapses for a box that shades nothing', () => {
    const spec = specOver();
    const range = occluderRange(box({ maxY: 2 }), spec, gridInterior(spec));
    // Reach zero: the block is the box's own cells and no more.
    expect(range.highY - range.lowY).toBeLessThanOrEqual(1);
  });
});

describe('bakeSkyVisibility', () => {
  it('leaves open ground seeing the whole sky', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    bakeSkyVisibility({ occluders: [box()], spec, range: gridInterior(spec), direction });
    expect(visibilityAt(direction, spec, 120, 2, 120)).toBeCloseTo(1, 2);
  });

  it('shades the ground beside a building', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const building = box({ maxX: 64, maxY: 48, maxZ: 64, density: 0.8 });
    bakeSkyVisibility({ occluders: [building], spec, range: gridInterior(spec), direction });
    const beside = visibilityAt(direction, spec, 70, 2, 32);
    expect(beside).toBeLessThan(0.9);
    expect(beside).toBeGreaterThanOrEqual(SKY_VISIBILITY_FLOOR);
  });

  it('shades a courtyard more than the open side of the same wall', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const west = box({ minX: 0, maxX: 12, minZ: 0, maxZ: 64, maxY: 48, density: 0.9 });
    const east = box({ minX: 36, maxX: 48, minZ: 0, maxZ: 64, maxY: 48, density: 0.9 });
    bakeSkyVisibility({ occluders: [west, east], spec, range: gridInterior(spec), direction });
    const between = visibilityAt(direction, spec, 24, 2, 32);
    const outside = visibilityAt(direction, spec, 72, 2, 32);
    expect(between).toBeLessThan(outside);
  });

  it('writes nothing outside the block it was given', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const range = { lowX: 1, highX: 2, lowY: 1, highY: 2, lowZ: 1, highZ: 2 };
    bakeSkyVisibility({ occluders: [box()], spec, range, direction });
    expect(visibilityAt(direction, spec, 120, 2, 120)).toBe(1);
  });

  it('touches only the alpha channel', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(128);
    bakeSkyVisibility({ occluders: [box()], spec, range: wholeGrid(spec), direction });
    for (let cell = 0; cell < spec.dims.x * spec.dims.y * spec.dims.z; cell++) {
      expect(direction[cell * 4]).toBe(128);
      expect(direction[cell * 4 + 1]).toBe(128);
      expect(direction[cell * 4 + 2]).toBe(128);
    }
  });
});

describe('a bake and the lamp bake sharing one volume', () => {
  it('survives a lamp being re-baked over the same cells', () => {
    const spec = specOver();
    const grid = bakeLightGrid([], spec);
    const occluder = box({ maxX: 64, maxY: 48, maxZ: 64, density: 0.8 });
    createLiveSkyVisibility(spec, grid.direction, [occluder]);
    const shaded = visibilityAt(grid.direction, spec, 70, 2, 32);
    expect(shaded).toBeLessThan(0.9);

    // The lamp bake owns the other three channels and must not touch this one.
    bakeLightGrid([], spec);
    expect(visibilityAt(grid.direction, spec, 70, 2, 32)).toBe(shaded);
  });
});

describe('createLiveSkyVisibility', () => {
  it('bakes what is standing when it is made', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const live = createLiveSkyVisibility(spec, direction, [
      box({ maxX: 64, maxY: 48, maxZ: 64, density: 0.8 }),
    ]);
    expect(live.occluderCount).toBe(1);
    expect(visibilityAt(direction, spec, 70, 2, 32)).toBeLessThan(0.9);
  });

  it('shades the ground under something built later', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const live = createLiveSkyVisibility(spec, direction, []);
    expect(visibilityAt(direction, spec, 70, 2, 32)).toBe(1);

    const range = live.add(box({ maxX: 64, maxY: 48, maxZ: 64, density: 0.8 }));
    expect(range).not.toBeNull();
    expect(live.occluderCount).toBe(1);
    expect(visibilityAt(direction, spec, 70, 2, 32)).toBeLessThan(0.9);
  });

  it('gives the same answer as a bake of everything at once', () => {
    const spec = specOver();
    const first = box({ maxX: 48, maxY: 40, maxZ: 48, density: 0.7 });
    const second = box({ minX: 64, maxX: 96, minZ: 0, maxZ: 32, maxY: 36, density: 0.7 });

    const incremental = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const live = createLiveSkyVisibility(spec, incremental, [first]);
    live.add(second);

    const wholesale = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    createLiveSkyVisibility(spec, wholesale, [first, second]);

    expect([...incremental]).toEqual([...wholesale]);
  });

  it('counts nothing for a box that shades nothing', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    const live = createLiveSkyVisibility(spec, direction, []);
    expect(live.add(box({ maxY: 2 }))).toBeNull();
    expect(live.occluderCount).toBe(0);
  });

  describe('against a bake of the whole interior', () => {
    it('agrees for one box', () => {
      const direction = expectSameBake([box({ maxX: 48, maxY: 40, maxZ: 48, density: 0.7 })]);
      expect(direction.some((byte) => byte < 255)).toBe(true);
    });

    it('agrees for boxes whose reach overlaps', () => {
      expectSameBake([
        box({ maxX: 48, maxY: 40, maxZ: 48, density: 0.7 }),
        box({ minX: 32, maxX: 64, minZ: 24, maxZ: 56, maxY: 36, density: 0.5 }),
        box({ minX: 8, maxX: 12, minZ: 60, maxZ: 64, maxY: 44, density: 0.05 }),
      ]);
    });

    it('agrees when a box too low to shade is mixed in', () => {
      expectSameBake([
        box({ maxY: MIN_OCCLUDER_HEIGHT - 1, maxX: 96, maxZ: 96, density: 1 }),
        box({ minX: 64, maxX: 96, minZ: 0, maxZ: 32, maxY: 36, density: 0.7 }),
      ]);
    });

    it('leaves every cell open with no boxes at all', () => {
      const direction = expectSameBake([]);
      expect(direction.every((byte) => byte === 255)).toBe(true);
    });
  });

  it('leaves the shell the sampler clamps against fully open', () => {
    const spec = specOver();
    const direction = new Uint8Array(spec.dims.x * spec.dims.y * spec.dims.z * 4).fill(255);
    createLiveSkyVisibility(spec, direction, [box({ maxX: 512, maxY: 96, maxZ: 512, density: 1 })]);
    const edge = (spec.dims.x - 1 + spec.dims.x * spec.dims.y * (spec.dims.z - 1)) * 4 + 3;
    expect(direction[edge]).toBe(255);
  });
});
