import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export const EDGE = 15;

// Hashed rather than random, so a re-render draws the same picture and the PNG does not churn.
export const scatter = (x: number, z: number): number =>
  (((x * 73856093) ^ (z * 19349663)) >>> 0) % 10;

export function speckle(ramp: Ramp, x: number, z: number): Color {
  const roll = scatter(x, z);
  if (roll < 2) return ramp.light;
  return roll < 4 ? ramp.shade : ramp.base;
}

// Soil under a speckled top, the cut the brushes leave at a slope's edge.
export function slab(b: VoxelBuilder, top: Ramp, soil: Color = PALETTE.teak.shade): void {
  b.box(0, EDGE, 0, 1, 0, EDGE, soil);
  for (let x = 0; x <= EDGE; x++) {
    for (let z = 0; z <= EDGE; z++) b.set(x, 2, z, speckle(top, x, z));
  }
}
