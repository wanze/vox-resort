import { PALETTE, type Ramp } from '../../../../voxel-gen/palette.ts';
import { linearRgbOf } from '../../lighting/domain/lightGrid';

export type LinearRgb = readonly [number, number, number];

export interface RampSwap {
  readonly steps: readonly LinearRgb[];
  readonly factors: readonly LinearRgb[];
}

// The art's own colour comes first, so a share of the town keeps the look it was painted in.
const WALL_TINTS = [PALETTE.stucco.base, 0xe4c48e, 0xecd0c6, 0xf3efe7, 0xdcc6a0] as const;
const ROOF_TINTS = [PALETTE.terracotta.base, 0xb85a3c, 0xcc7c4a, 0xa8604a] as const;

const stepsOf = (ramp: Ramp): LinearRgb[] =>
  [ramp.light, ramp.base, ramp.shade, ramp.deep].map(linearRgbOf);

// A ratio rather than a colour: the darker steps are the base times a constant, which survives
// the trip to linear, so one factor recolours the whole ramp.
export function rampSwap(ramp: Ramp, tints: readonly number[]): RampSwap {
  const base = linearRgbOf(ramp.base);
  return {
    steps: stepsOf(ramp),
    factors: tints.map((tint) => {
      const target = linearRgbOf(tint);
      return [target[0] / base[0], target[1] / base[1], target[2] / base[2]] as const;
    }),
  };
}

export const WALL_SWAP = rampSwap(PALETTE.stucco, WALL_TINTS);
export const ROOF_SWAP = rampSwap(PALETTE.terracotta, ROOF_TINTS);
