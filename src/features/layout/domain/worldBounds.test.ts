import { describe, expect, it } from 'vitest';
import type { Placement } from './resortLayout';
import type { OrthographicFraming, WorldBounds } from './worldBounds';
import {
  cameraFramingFor,
  COMPASS_DIRECTIONS,
  ISOMETRIC_ELEVATION_DEGREES,
  isometricFramingFor,
  turnDirection,
  worldBoundsFor,
} from './worldBounds';

const at = (id: string, x: number, z: number, width: number, depth: number, y = 0): Placement => ({
  key: id,
  id,
  tileX: Math.floor(x / 16),
  tileZ: Math.floor(z / 16),
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x,
  z,
  y,
  width,
  depth,
});

const placements: Placement[] = [at('a', 0, 0, 4, 4), at('b', 32, 0, 6, 2), at('c', 0, 32, 2, 8)];

const heights: Record<string, number> = { a: 3, b: 12, c: 5 };

describe('worldBoundsFor', () => {
  it('covers every placement', () => {
    const bounds = worldBoundsFor(placements, (id) => heights[id] ?? 0);
    for (const placement of placements) {
      expect(placement.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(placement.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(placement.x + placement.width).toBeLessThanOrEqual(bounds.maxX);
      expect(placement.z + placement.depth).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it('takes the tallest object as the world height', () => {
    expect(worldBoundsFor(placements, (id) => heights[id] ?? 0).height).toBe(12);
  });

  it('counts the terrace an object stands on towards the height', () => {
    // A short object on a high bench reaches further up than a tall one at sea
    // level, and it is the cameras that have to be framed on the taller of them.
    const raised = [at('hut', 0, 0, 16, 16, 40)];
    expect(worldBoundsFor(raised, () => 12).height).toBe(52);
  });

  it('collapses to zero for an empty layout', () => {
    expect(worldBoundsFor([], () => 5)).toEqual({
      minX: 0,
      minZ: 0,
      maxX: 0,
      maxZ: 0,
      height: 0,
    });
  });
});

describe('cameraFramingFor', () => {
  const bounds = worldBoundsFor(placements, (id) => heights[id] ?? 0);

  it('targets the middle of the plot', () => {
    const { target } = cameraFramingFor(bounds, 60);
    expect(target.x).toBeCloseTo((bounds.minX + bounds.maxX) / 2);
    expect(target.z).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2);
  });

  it('stands off far enough to see the whole plot', () => {
    const { target, position } = cameraFramingFor(bounds, 60);
    const extent = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const distance = Math.hypot(
      position.x - target.x,
      position.y - target.y,
      position.z - target.z,
    );
    expect(distance).toBeGreaterThan(extent / 2);
  });

  it('pulls back further for a narrower field of view', () => {
    const near = cameraFramingFor(bounds, 80).position;
    const far = cameraFramingFor(bounds, 30).position;
    expect(far.y).toBeGreaterThan(near.y);
  });

  it('stays finite for a degenerate world', () => {
    const framing = cameraFramingFor({ minX: 0, minZ: 0, maxX: 0, maxZ: 0, height: 0 }, 60);
    expect(Number.isFinite(framing.position.x)).toBe(true);
    expect(Number.isFinite(framing.position.y)).toBe(true);
  });
});

describe('turnDirection', () => {
  it('turns clockwise through the corners', () => {
    expect(turnDirection('northeast', 1)).toBe('southeast');
    expect(turnDirection('southeast', 1)).toBe('southwest');
    expect(turnDirection('southwest', 1)).toBe('northwest');
    expect(turnDirection('northwest', 1)).toBe('northeast');
  });

  it('turns anticlockwise on a negative quarter', () => {
    expect(turnDirection('northeast', -1)).toBe('northwest');
    expect(turnDirection('southeast', -3)).toBe('southwest');
  });

  it('comes back to where it started after four', () => {
    for (const direction of COMPASS_DIRECTIONS) {
      expect(turnDirection(direction, 4)).toBe(direction);
      expect(turnDirection(direction, 0)).toBe(direction);
    }
  });
});

/** The unit vector from the camera towards what it is looking at. */
const forwardOf = (framing: OrthographicFraming) => {
  const dx = framing.target.x - framing.position.x;
  const dy = framing.target.y - framing.position.y;
  const dz = framing.target.z - framing.position.z;
  const length = Math.hypot(dx, dy, dz);
  return { x: dx / length, y: dy / length, z: dz / length };
};

/** Every corner of the plot, which is what the clip planes have to contain. */
const cornersOf = (box: WorldBounds) =>
  [box.minX, box.maxX].flatMap((x) =>
    [0, box.height].flatMap((y) => [box.minZ, box.maxZ].map((z) => ({ x, y, z }))),
  );

describe('isometricFramingFor', () => {
  const bounds = worldBoundsFor(placements, (id) => heights[id] ?? 0);

  it('targets the middle of the plot from every direction', () => {
    for (const direction of COMPASS_DIRECTIONS) {
      const { target } = isometricFramingFor(bounds, direction);
      expect(target.x).toBeCloseTo((bounds.minX + bounds.maxX) / 2);
      expect(target.z).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2);
    }
  });

  it('stands the camera over the corner it is named for', () => {
    // North is -z and east is +x, the compass the plan is laid out on.
    const corners = {
      northeast: { x: 1, z: -1 },
      southeast: { x: 1, z: 1 },
      southwest: { x: -1, z: 1 },
      northwest: { x: -1, z: -1 },
    } as const;
    for (const direction of COMPASS_DIRECTIONS) {
      const { target, position } = isometricFramingFor(bounds, direction);
      expect(Math.sign(position.x - target.x)).toBe(corners[direction].x);
      expect(Math.sign(position.z - target.z)).toBe(corners[direction].z);
    }
  });

  it('stands over a corner, not a side, which is what makes it isometric', () => {
    // Both horizontal axes at the same angle: a building shows two faces rather
    // than one flat elevation.
    for (const direction of COMPASS_DIRECTIONS) {
      const { target, position } = isometricFramingFor(bounds, direction);
      expect(Math.abs(position.x - target.x)).toBeCloseTo(Math.abs(position.z - target.z));
    }
  });

  it('looks down at the same angle whichever way it faces', () => {
    const elevations = COMPASS_DIRECTIONS.map((direction) => {
      const framing = isometricFramingFor(bounds, direction);
      const forward = forwardOf(framing);
      return Math.asin(-forward.y) * (180 / Math.PI);
    });
    for (const elevation of elevations) {
      expect(elevation).toBeCloseTo(ISOMETRIC_ELEVATION_DEGREES, 6);
    }
  });

  it('covers the plot it is framing', () => {
    // Across the screen runs the plot's diagonal, foreshortened by the 45 degree
    // turn; up it runs the rest of that diagonal plus what stands on the plot.
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    for (const direction of COMPASS_DIRECTIONS) {
      const framing = isometricFramingFor(bounds, direction);
      expect(framing.viewWidth).toBeGreaterThanOrEqual((width + depth) / Math.SQRT2);
      expect(framing.viewHeight).toBeGreaterThan(0);
    }
  });

  it('frames the plot the same way from every corner', () => {
    // The whole point of a corner azimuth: turning the plot does not resize it.
    const framings = COMPASS_DIRECTIONS.map((direction) => isometricFramingFor(bounds, direction));
    for (const framing of framings) {
      expect(framing.viewWidth).toBeCloseTo(framings[0]!.viewWidth);
      expect(framing.viewHeight).toBeCloseTo(framings[0]!.viewHeight);
    }
  });

  it('keeps the whole plot between the clip planes, from every direction', () => {
    for (const direction of COMPASS_DIRECTIONS) {
      const framing = isometricFramingFor(bounds, direction);
      const forward = forwardOf(framing);
      for (const corner of cornersOf(bounds)) {
        const depth =
          (corner.x - framing.position.x) * forward.x +
          (corner.y - framing.position.y) * forward.y +
          (corner.z - framing.position.z) * forward.z;
        expect(depth).toBeGreaterThan(framing.near);
        expect(depth).toBeLessThan(framing.far);
      }
    }
  });

  it('puts the near plane behind the camera, not in front of it', () => {
    // Orthographic depth is linear, so cropping the range buys nothing — and a
    // near plane in front of the camera drops below the ground as soon as the
    // view is zoomed out far enough, which would take `groundPointAt` with it.
    for (const direction of COMPASS_DIRECTIONS) {
      const framing = isometricFramingFor(bounds, direction);
      expect(framing.near).toBeLessThan(0);
      expect(framing.far).toBeGreaterThan(-framing.near / 2);
    }
  });

  it('stays finite for a degenerate world', () => {
    const framing = isometricFramingFor(
      { minX: 0, minZ: 0, maxX: 0, maxZ: 0, height: 0 },
      'northeast',
    );
    for (const value of [
      framing.position.x,
      framing.position.y,
      framing.position.z,
      framing.viewWidth,
      framing.viewHeight,
      framing.near,
      framing.far,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(framing.viewWidth).toBeGreaterThan(0);
    expect(framing.viewHeight).toBeGreaterThan(0);
  });
});
