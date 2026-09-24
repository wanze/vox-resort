// The figure faces +z: the crowd turns each instance to its heading, so a model facing
// any other way walks the plot backwards.

import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export const ADULT_VOXELS = 7;

export const CHILD_VOXELS = 6;

const BODY_LAYERS = 4;

export const hipHeight = (height: number): number => height - BODY_LAYERS;

export interface FigureOptions {
  readonly skin: Color;
  readonly hair: Color;
  readonly shirt: Color;
  readonly legs: Color;
  readonly height?: number;
}

export function figure(b: VoxelBuilder, o: FigureOptions): void {
  const height = o.height ?? ADULT_VOXELS;
  if (height < 4) throw new Error(`A figure needs at least four voxels, not ${height}`);

  const hairY = height - 1;
  const headY = height - 2;
  const shirtY = hipHeight(height);

  for (const x of [0, 2]) b.box(x, x, 0, shirtY - 1, 0, 1, o.legs);

  b.box(0, 2, shirtY, headY - 1, 0, 1, o.shirt);

  b.box(1, 1, headY, headY, 0, 1, o.skin);
  b.box(1, 1, hairY, hairY, 0, 1, o.hair);
}

export const WARDROBE: readonly Ramp[] = [
  PALETTE.stucco,
  PALETTE.bloom,
  PALETTE.amber,
  PALETTE.water,
  PALETTE.foliage,
  PALETTE.glass,
  PALETTE.slate,
  PALETTE.teak,
];
