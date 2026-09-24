import { createRandom } from '../../layout/domain/random';
import type { Weather } from '../../sim/domain/weather';

const COLUMN_MARGIN = 1.1;

// The floor stops a close camera wrapping the field into a few metres; the ceiling
// stops a horizon view thinning a fixed pool of drops to nothing.
const MIN_COLUMN = 120;
const MAX_COLUMN = 7000;

// Slanted ground stretches by 1 / sin(elevation); clamped near 20 degrees so close
// views do not pay for a horizon nobody is looking at.
const MIN_SIN_ELEVATION = 0.35;

// Bounded in voxels as well as pixels: the top must clear the tallest building, and the bottom
// reaches below the target because the ground elsewhere is lower.
const FALL_PIXELS = 520;
const FALL_ABOVE = 0.8;
const MIN_FALL = 240;
const MAX_FALL = 1400;

const RAIN_SLANT = 0.16;
const STORM_SLANT = 0.42;

// Fixed: the bay is to the north, and a storm blowing inland off it is the one that reads.
const WIND_HEADING = -0.6;

const WIDTH_PIXELS = 1.6;

export interface RainView {
  readonly voxelsPerPixel: number;
  readonly width: number;
  readonly height: number;
  readonly rise: number;
  readonly distance: number;
}

export interface RainfallLook {
  readonly drops: number;
  readonly fall: number;
  readonly length: number;
  readonly width: number;
  readonly leanX: number;
  readonly leanZ: number;
  readonly opacity: number;
  readonly column: number;
  readonly top: number;
  readonly height: number;
}

// Sized in screen pixels, not voxels, on purpose: the same drops look like the same
// rain at every zoom, where real-sized drops vanish from the overview.
const RAINFALL: {
  readonly [kind in Weather]?: {
    readonly drops: number;
    readonly fallPixels: number;
    readonly lengthPixels: number;
    readonly slant: number;
    readonly opacity: number;
  };
} = {
  // Faint on purpose: rain is the texture thousands of streaks make, not single streaks.
  rain: { drops: 2000, fallPixels: 620, lengthPixels: 16, slant: RAIN_SLANT, opacity: 0.15 },
  storm: { drops: 4200, fallPixels: 950, lengthPixels: 26, slant: STORM_SLANT, opacity: 0.22 },
};

export const MAX_DROPS = Math.max(...Object.values(RAINFALL).map((row) => row.drops));

export function isWet(weather: Weather): boolean {
  return RAINFALL[weather] !== undefined;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

// Squared off because the camera can turn. Errs high: overshooting only thins the
// rain, undershooting leaves a wet square on a dry plot.
export function columnFor(view: RainView): number {
  const sinElevation = clamp(view.rise / Math.max(view.distance, 1e-6), MIN_SIN_ELEVATION, 1);
  const across = view.width * view.voxelsPerPixel;
  const along = (view.height * view.voxelsPerPixel) / sinElevation;
  return clamp(Math.max(across, along) * COLUMN_MARGIN, MIN_COLUMN, MAX_COLUMN);
}

// Null rather than zero drops, so the field skips its per-frame write on a dry day.
export function rainfallFor(weather: Weather, view: RainView): RainfallLook | null {
  const row = RAINFALL[weather];
  if (!row) return null;
  const perPixel = Math.max(view.voxelsPerPixel, 1e-6);
  const length = row.lengthPixels * perPixel;
  const height = clamp(FALL_PIXELS * perPixel, MIN_FALL, MAX_FALL);
  return {
    drops: row.drops,
    fall: row.fallPixels * perPixel,
    length,
    width: WIDTH_PIXELS * perPixel,
    // Over the streak's own length: this is the shear the instance matrix carries.
    leanX: Math.sin(WIND_HEADING) * row.slant * length,
    leanZ: Math.cos(WIND_HEADING) * row.slant * length,
    opacity: row.opacity,
    column: columnFor(view),
    top: height * FALL_ABOVE,
    height,
  };
}

export interface Raindrops {
  readonly count: number;
  readonly atX: Float32Array;
  readonly atZ: Float32Array;
  readonly phase: Float32Array;
}

// Shares of the column, not voxels, because the column changes with zoom. Seeded so
// `pnpm bench` runs are comparable.
export function createRaindrops(count: number, seed: number): Raindrops {
  const size = Math.max(0, Math.trunc(count));
  const random = createRandom(seed);
  const drops: Raindrops = {
    count: size,
    atX: new Float32Array(size),
    atZ: new Float32Array(size),
    phase: new Float32Array(size),
  };
  for (let index = 0; index < size; index++) {
    drops.atX[index] = random();
    drops.atZ[index] = random();
    drops.phase[index] = random();
  }
  return drops;
}

// A drop keeps its world position and only jumps by a whole column when it would
// leave the box, so it does not slide as the view pans.
export function nearestTo(at: number, of: number, column: number): number {
  return at - Math.round((at - of) / column) * column;
}

export interface DropPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// Stateless: the fall is taken modulo the column height, so nothing respawns and
// frame rate cannot drift it. Drift applies before the wrap to stay inside the box.
export function dropAt(
  drops: Raindrops,
  index: number,
  seconds: number,
  look: RainfallLook,
  centre: DropPose,
): DropPose {
  const fallen = (drops.phase[index]! * look.height + seconds * look.fall) % look.height;
  const carried = fallen / look.length;
  return {
    x: nearestTo(drops.atX[index]! * look.column - look.leanX * carried, centre.x, look.column),
    y: centre.y + look.top - fallen,
    z: nearestTo(drops.atZ[index]! * look.column - look.leanZ * carried, centre.z, look.column),
  };
}
