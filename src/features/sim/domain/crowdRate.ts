// The crowd walks faster than real time: at 1.4 m/s crossing the plot would take
// longer than a simulated day and guests would starve on the way.

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { MAX_SUBSTEPS, WALK_SPEED } from '../../crowd/domain/crowd';
import { SPEED_DAY_SECONDS, type SimSpeed } from './simClock';

const PLOT_CROSSING_VOXELS = 112 * TILE_VOXELS;

// A tenth of a day lets archetype decay rates, not the walk, decide how hungry a guest arrives.
const ERRAND_SHARE_OF_DAY = 0.1;

// Capped at MAX_SUBSTEPS to bound avoidance cost per frame; at rush guests fall behind the day,
// which is accepted. 1 while paused so it stays a sane multiplier: the animation loop is what stops
// the crowd.
export function crowdScaleFor(speed: SimSpeed): number {
  const wanted =
    PLOT_CROSSING_VOXELS / WALK_SPEED / (ERRAND_SHARE_OF_DAY * SPEED_DAY_SECONDS[speed]);
  return Math.min(MAX_SUBSTEPS, Math.max(1, wanted));
}

export const WALK_VOXELS_PER_SIM_HOUR = PLOT_CROSSING_VOXELS / (ERRAND_SHARE_OF_DAY * 24);
