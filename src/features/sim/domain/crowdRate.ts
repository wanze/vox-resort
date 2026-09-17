/**
 * How fast the crowd walks against the calendar: the one decision that makes a
 * guest's day fit the clock.
 *
 * The crowd walks at `WALK_SPEED`, an unhurried 1.4 m/s, and the calendar runs a
 * day in `SPEED_DAY_SECONDS`. Left on real time, crossing the reference plot
 * takes 320 real seconds whatever the clock says - more than a whole simulated
 * day at `normal` - and a family walking to the near edge of their own reach
 * arrives having lost 0.91 of their hunger on the way. `archetypes.ts`'s decay
 * rates never reach a guest like that. So the crowd walks at a multiple of real
 * time, worked out from the speed here, and `crowd.ts` sub-steps it so avoidance
 * and arrivals behave. See `plans/026-a-guests-day.md` for the table.
 *
 * Scenery is not scaled: balloons and boats take the frame's own delta, and are
 * on no clock anybody is reasoning about.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { MAX_SUBSTEPS, WALK_SPEED } from '../../crowd/domain/crowd';
import { SPEED_DAY_SECONDS, type SimSpeed } from './simClock';

/**
 * The walk an errand is measured by, in voxels: the width of the reference plot,
 * 112 tiles. The far side of the resort, which is the longest errand anybody is
 * likely to run on it.
 */
const PLOT_CROSSING_VOXELS = 112 * TILE_VOXELS;

/**
 * How long crossing the reference plot should take, as a share of a simulated
 * day.
 *
 * The number the whole plan turns on. A tenth of a day is 2.4 simulated hours:
 * a guest who walks to the far side of the plot spends a chunk of an afternoon
 * on it rather than a day and a half, and a family walking to the end of their
 * own 320-voxel reach spends 26 minutes and loses under a tenth of their hunger
 * - which is what lets `archetypes.ts`'s decay rates, rather than the walk,
 * decide how hungry somebody is when they get there.
 */
const ERRAND_SHARE_OF_DAY = 0.1;

/**
 * How many times faster than real time the crowd walks at this speed.
 *
 * Derived from `SPEED_DAY_SECONDS` rather than four numbers of its own, so a
 * preset that changes carries the crowd with it: 3.6 at `slow`, 10.7 at
 * `normal`, 26.7 at `fast`.
 *
 * **Capped at `MAX_SUBSTEPS`**, the most steps `stepCrowd` runs in one call and
 * so the most avoidance passes a frame pays for. Past it a guest's day fits the
 * clock and the frame does not fit the budget; `resortWalk.test.ts` holds the
 * cost. `rush` hits it - it would want 107 - so at `rush` guests fall behind the
 * day, crossing the plot in eight simulated hours. That is acceptable and meant:
 * `rush` is the day-night cycle as a thing to look at rather than a thing to play.
 *
 * **1 while paused**, not 0 and not `Infinity`, so the scale stays a sane
 * multiplier wherever it is read. A paused resort still stands still, but it is
 * the animation loop in `showcase.ts` that sees to that, by stepping the crowd
 * by a frame of no time - not this.
 */
export function crowdScaleFor(speed: SimSpeed): number {
  const wanted =
    PLOT_CROSSING_VOXELS / WALK_SPEED / (ERRAND_SHARE_OF_DAY * SPEED_DAY_SECONDS[speed]);
  return Math.min(MAX_SUBSTEPS, Math.max(1, wanted));
}

/**
 * How far a guest walks in one **simulated** hour, in voxels.
 *
 * The same two numbers as {@link crowdScaleFor}, read the other way round:
 * crossing the plot is {@link PLOT_CROSSING_VOXELS} and takes
 * {@link ERRAND_SHARE_OF_DAY} of a day, so a simulated hour is that far. It is
 * the same at `slow`, `normal` and `fast`, which is the whole point of scaling
 * the crowd to the calendar rather than to the frame - at `rush` the cap bites
 * and guests fall behind, which is meant.
 *
 * `appeal.ts` is what wants it: how hungry somebody will be **when they get
 * there** is what a relief has room to fill, and that is a question about how
 * long the walk takes in the guest's own day.
 */
export const WALK_VOXELS_PER_SIM_HOUR = PLOT_CROSSING_VOXELS / (ERRAND_SHARE_OF_DAY * 24);
