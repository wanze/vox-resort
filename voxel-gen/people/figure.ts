// The figure faces +z: the crowd turns each instance to its heading, so a model facing
// any other way walks the plot backwards.

import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export const ADULT_VOXELS = 7;

export const CHILD_VOXELS = 6;

// Painted at half a world voxel, so a limb can be thinner than the body; every height and
// width outside `figure()` is in world voxels.
export const FIGURE_SCALE = 0.5;

const FINE = 1 / FIGURE_SCALE;

const BODY_LAYERS = 4;

export const hipHeight = (height: number): number => height - BODY_LAYERS;

// Shared with the shader's arm weights, as hipHeight is: the arm turns about this height.
export const shoulderHeight = (height: number): number => height - 2;

// A sleeve's length above twice that in bare forearm, so the hand hangs beside the thigh.
export const ARM_VOXELS = 3;

export const handHeight = (height: number): number => shoulderHeight(height) - ARM_VOXELS;

// Half of the chest's two voxels across, measured from the figure's middle: beyond it is an arm.
export const CHEST_HALF_WIDTH = 1;

export interface FigureOptions {
  readonly skin: Color;
  readonly hair: Color;
  readonly shirt: Color;
  readonly sleeves: Color;
  readonly legs: Color;
  // Over the hair, the top voxel of the head: a uniform no guest can be dressed in.
  readonly cap?: Color;
  readonly height?: number;
}

export function figure(b: VoxelBuilder, o: FigureOptions): void {
  const height = o.height ?? ADULT_VOXELS;
  if (height < 5) throw new Error(`A figure needs at least five voxels, not ${height}`);

  const hip = hipHeight(height) * FINE;
  const shoulder = shoulderHeight(height) * FINE;
  const hand = handHeight(height) * FINE;
  const top = height * FINE - 1;

  // A gap between the legs, and colours of their own on the arms, so the mesher merges no face
  // across two limbs that the shader moves apart.
  for (const x of [1, 4]) b.box(x, x, 0, hip - 1, 1, 2, o.legs);

  const chest = CHEST_HALF_WIDTH * FINE;
  b.box(3 - chest, 2 + chest, hip, shoulder - 1, 0, 3, o.shirt);
  for (const x of [0, 5]) {
    b.box(x, x, shoulder - FINE, shoulder - 1, 1, 2, o.sleeves);
    b.box(x, x, hand, shoulder - FINE - 1, 1, 2, o.skin);
  }

  b.box(2, 3, shoulder, top - FINE, 0, 3, o.skin);
  b.box(2, 3, top - FINE + 1, top, 0, 3, o.cap ?? o.hair);
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
