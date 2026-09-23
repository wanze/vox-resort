/**
 * The rain on screen: where every drop is, at a moment, over a camera that has
 * moved.
 *
 * ## This is the drawn half of the weather, and `sim/domain/weather.ts` is the
 * decided half
 *
 * That module says what kind of day it is and what the day does to the people
 * on the plot - the need weights, the decay rates, what shuts, how grey the sky
 * goes. None of it can be seen falling. This one says what a wet day *looks*
 * like and nothing else: it reads a `Weather` and hands back streaks. A change
 * here cannot move a guest, and a change there cannot move a drop.
 *
 * ## The rain is sized in pixels, not in voxels
 *
 * Everything in {@link RAINFALL} is a length on the screen, turned into voxels
 * by the view it is asked about. A drop is therefore the same size and the same
 * speed however far out the camera is pulled, and the column of air being drawn
 * is whatever the camera can actually see - so a fixed few thousand drops are
 * the same rain at every zoom rather than a dense square in the middle of a dry
 * plot.
 *
 * That is not physical and it is deliberate. Rain a hundred metres off is a
 * veil rather than a row of visible drops, and a field that kept its drops the
 * size of real ones would be invisible from the overview and enormous from the
 * ground. What has to be constant is what it looks like.
 *
 * ## Columns, and nothing per drop that the collector has to walk
 *
 * The same shape as `balloons/domain/balloons.ts`, for the same reason and
 * rather more urgently: there are a few dozen balloons and a few thousand
 * drops, all of them rewritten every frame.
 *
 * ## A drop has no state at all - it is a lattice point read at a time
 *
 * Nothing here is stepped. A drop is a fixed spot on an infinite lattice plus a
 * phase, and where it is *now* is arithmetic over the elapsed seconds - so the
 * field is identical at any frame rate, a stopped clock does not drift it, and
 * there is no per-frame write-back to a column at all. The wrap in
 * {@link nearestTo} is what makes the lattice infinite: a drop is drawn at
 * whichever of its images is nearest the camera, so panning across a plot 1792
 * voxels wide costs the same few thousand drops as standing still.
 *
 * That is also why rain is not a `Placement` and reaches neither bake, for the
 * reason a balloon is not: the volumes are static by construction, and this
 * thing crosses the whole column every second or two.
 */

import { createRandom } from '../../layout/domain/random';
import type { Weather } from '../../sim/domain/weather';

/** How far either side of the visible ground the column reaches. */
const COLUMN_MARGIN = 1.1;

/**
 * The narrowest and widest column that will be drawn, in voxels.
 *
 * The floor keeps a camera pushed right up against a wall from wrapping the
 * whole field into a few metres. The ceiling is the more useful of the two: a
 * camera low enough to see to the horizon would otherwise ask for a column
 * wider than any plot, and spreading a fixed pool of drops over it would thin
 * the rain to nothing. Past the ceiling the rain is simply sparser than it
 * should be, which is better than absent.
 */
const MIN_COLUMN = 120;
const MAX_COLUMN = 7000;

/**
 * The flattest the camera is taken to be looking, as the sine of its elevation.
 *
 * Ground seen at a slant is stretched along the screen's vertical by
 * `1 / sin(elevation)`, which is why an overview needs a column half again as
 * wide as the screen suggests. At the horizon that factor runs away, so it is
 * clamped: about 20 degrees, below which the far half of the view is drier than
 * the near half. That is the correct thing to give up - the alternative is
 * every close view paying for a column sized by a distance nobody is looking
 * at.
 */
const MIN_SIN_ELEVATION = 0.35;

/**
 * How high the rain reaches above and below what the camera is looking at, as
 * a length on the screen and the share of it spent above.
 *
 * Bounded in voxels as well, because this is the one measurement that has a
 * physical job to do: the top has to clear the tallest thing on the plot, or
 * rain would start inside a hotel roof at a close zoom. The bottom goes under
 * the target because the target sits on the ground at one spot and the ground
 * elsewhere is lower - a fall that stopped at the target's height would leave
 * the beach dry.
 */
const FALL_PIXELS = 520;
const FALL_ABOVE = 0.8;
const MIN_FALL = 240;
const MAX_FALL = 1400;

/** How far a streak leans off vertical per voxel it falls, by how hard it blows. */
const RAIN_SLANT = 0.16;
const STORM_SLANT = 0.42;

/**
 * Which way the weather comes in from, as a heading in radians.
 *
 * One wind for the whole plot, as the balloons have one breeze: rain falling
 * every which way is a screensaver, and rain coming in off the sea is weather.
 * Fixed rather than drawn, because it is the direction the *plot* was authored
 * against - the bay is to the north - and a storm blowing inland off it is the
 * one that reads.
 */
const WIND_HEADING = -0.6;

/** Pixels a streak is across, at any zoom: a hairline, and rain is a hairline. */
const WIDTH_PIXELS = 1.6;

/** What the camera is doing, which is all the rain needs to know about it. */
export interface RainView {
  /** Voxels one pixel covers at what the camera is looking at. */
  readonly voxelsPerPixel: number;
  /** The drawing buffer, in pixels. */
  readonly width: number;
  readonly height: number;
  /** How high the camera stands above what it is looking at, in voxels. */
  readonly rise: number;
  /** How far it stands from it, in voxels. */
  readonly distance: number;
}

/** What one kind of day draws, or nothing at all on a day that draws none. */
export interface RainfallLook {
  /** Drops in the air, of the pool the field was built with. */
  readonly drops: number;
  /** Voxels a drop falls per second. */
  readonly fall: number;
  /** Voxels a streak is long; the faster it falls the longer it smears. */
  readonly length: number;
  /** Voxels a streak is across. */
  readonly width: number;
  /** How far the streak tips off vertical over its own length, in voxels. */
  readonly leanX: number;
  readonly leanZ: number;
  /** How solid a streak is drawn, 0..1. */
  readonly opacity: number;
  /** The side of the box a drop is wrapped into, in voxels. */
  readonly column: number;
  /** Voxels the rain reaches above what the camera is looking at. */
  readonly top: number;
  /** Voxels from the top of the fall to the bottom of it. */
  readonly height: number;
}

/**
 * How hard each kind of day comes down, in pixels on the screen and seconds.
 *
 * The table, with the argument beside each row as `weather.ts`'s own has it.
 * `clear` and `heatwave` are absent rather than zeroed: a day that draws no
 * rain should have no row to tune.
 */
const RAINFALL: {
  readonly [kind in Weather]?: {
    readonly drops: number;
    /** Pixels a drop falls per second: what the eye reads as how hard it rains. */
    readonly fallPixels: number;
    /** Pixels a streak is long. */
    readonly lengthPixels: number;
    readonly slant: number;
    readonly opacity: number;
  };
} = {
  /**
   * Steady rain. Faint on purpose: a streak you can pick out one at a time is
   * a streak, and rain is the texture a few thousand of them make together.
   */
  rain: { drops: 2000, fallPixels: 620, lengthPixels: 16, slant: RAIN_SLANT, opacity: 0.15 },
  /**
   * Harder, longer, twice as many and blown further off vertical - but still
   * something the plot is legible through, because the plot is what the player
   * is being asked to read on the darkest day it has.
   */
  storm: { drops: 4200, fallPixels: 950, lengthPixels: 26, slant: STORM_SLANT, opacity: 0.22 },
};

/** The most drops any day asks for: what the field allocates its pool at. */
export const MAX_DROPS = Math.max(...Object.values(RAINFALL).map((row) => row.drops));

/**
 * Whether anything falls out of the sky on this kind of day.
 *
 * The same question {@link rainfallFor} answers, for a caller that has no
 * camera to ask about and does not want one - the balloons, which stay on the
 * sand in the wet whatever the view is doing. One table, read two ways, rather
 * than a second list of which days are wet.
 */
export function isWet(weather: Weather): boolean {
  return RAINFALL[weather] !== undefined;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * How wide a column of air has to be to cover what this camera can see.
 *
 * The screen's own width in voxels across, and its height in voxels stretched
 * by the slant the ground is seen at - see {@link MIN_SIN_ELEVATION}. The wider
 * of the two, squared off, because the camera can be turned and a box that only
 * covered the view from one compass point would leave a dry edge from the next.
 *
 * Overshooting only thins the rain; undershooting leaves a visible square of it
 * in the middle of a dry plot, which is the thing this exists to stop. So it
 * errs high.
 */
export function columnFor(view: RainView): number {
  const sinElevation = clamp(view.rise / Math.max(view.distance, 1e-6), MIN_SIN_ELEVATION, 1);
  const across = view.width * view.voxelsPerPixel;
  const along = (view.height * view.voxelsPerPixel) / sinElevation;
  return clamp(Math.max(across, along) * COLUMN_MARGIN, MIN_COLUMN, MAX_COLUMN);
}

/**
 * How hard it is coming down over this camera, or null on a day it is not.
 *
 * Null rather than a look with no drops in it, so the caller's test is "is it
 * raining" rather than "is the count zero": the field skips its whole per-frame
 * write on a null, which is what a clear day should cost.
 *
 * `heatwave` draws nothing for the reason it greys nothing - see
 * `sim/domain/weather.ts`. It is the one bad day that is not a wet one.
 */
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
    // Over the streak's own length rather than over the whole fall: this is the
    // shear the instance matrix carries, and it tips the top of one streak.
    leanX: Math.sin(WIND_HEADING) * row.slant * length,
    leanZ: Math.cos(WIND_HEADING) * row.slant * length,
    opacity: row.opacity,
    column: columnFor(view),
    top: height * FALL_ABOVE,
    height,
  };
}

/** Every drop the field can draw, as columns. See the note at the top. */
export interface Raindrops {
  readonly count: number;
  /** Where on the lattice it hangs, as a share of the column, 0..1. */
  readonly atX: Float32Array;
  readonly atZ: Float32Array;
  /** How far through its own fall it was at zero seconds, 0..1. */
  readonly phase: Float32Array;
}

/**
 * A pool of drops scattered over one cell of the lattice.
 *
 * Held as shares of the column rather than as voxels, because the column is not
 * a constant any more: it is whatever the camera can see this frame, and a pool
 * measured in voxels would have to be redrawn every time somebody zoomed.
 *
 * Seeded, for the reason the crowd and the balloons are: `pnpm bench` only
 * compares two runs if the scene has not moved.
 */
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

/**
 * The image of a lattice point nearest a spot: `at` moved by whole columns
 * until it is within half a column of `of`.
 *
 * This is the whole of what makes the rain follow the camera. A drop keeps one
 * fixed place in the world, so it stands still while the camera does and does
 * not slide about as the view pans; it only ever jumps, by a whole column, at
 * the moment it would otherwise leave the box - which is half a column from the
 * middle of the screen and off it.
 */
export function nearestTo(at: number, of: number, column: number): number {
  return at - Math.round((at - of) / column) * column;
}

/** Where the bottom of one streak is, in world voxels. */
export interface DropPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Where a drop is after this many seconds, over a camera looking here.
 *
 * The fall is taken modulo the column's height rather than integrated, so the
 * drop that has just gone into the ground is the same drop that comes out of
 * the cloud, and nothing has to be respawned. The drift is applied before the
 * wrap, so a drop the wind has carried a long way still lands inside the box.
 */
export function dropAt(
  drops: Raindrops,
  index: number,
  seconds: number,
  look: RainfallLook,
  centre: DropPose,
): DropPose {
  const fallen = (drops.phase[index]! * look.height + seconds * look.fall) % look.height;
  // How far the wind has carried it since it left the cloud, which is the same
  // slant the streak itself is drawn at - see `rainfallFor`.
  const carried = fallen / look.length;
  return {
    x: nearestTo(drops.atX[index]! * look.column - look.leanX * carried, centre.x, look.column),
    y: centre.y + look.top - fallen,
    z: nearestTo(drops.atZ[index]! * look.column - look.leanZ * carried, centre.z, look.column),
  };
}
