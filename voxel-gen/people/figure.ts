/**
 * The one figure every person in the resort is built from.
 *
 * A person is 1.75 m, and at four voxels to the metre that is **seven voxels**.
 * There is no room in seven voxels for anatomy, so what matters is not which
 * parts are drawn but which parts are drawn *large*: the resort is looked at
 * from an isometric camera standing over a corner of the plot, and what that
 * camera sees of a person is the top of their head and their shoulders. So the
 * hair and the shirt get a whole layer each and the legs give one up. A crowd
 * seen from above is a field of coloured caps and coloured shoulders, and that
 * is what makes one person tell apart from the next at this scale.
 *
 * Seven layers, from the ground up:
 *
 * ```
 *   6   hair        . # .     a narrow cap, centred on the shoulders
 *   5   head        . # .     one layer of face; no features fit in it
 *   4   shoulders   # # #     shirt, the full width
 *   3   chest       # # #
 *   2   legs        # . #     two legs and the gap between them
 *   1   legs        # . #
 *   0   legs        # . #
 * ```
 *
 * The head is **one voxel across** and the shoulders are three, and that
 * narrowing is the whole of what makes a figure read as a person rather than as
 * a coloured block on legs. It is also the closer of the two to true: a head is
 * about 15 cm across, which is well under one voxel, so three would be four
 * times life size. Drawn as wide as the shoulders it looked like a chest of
 * drawers, which is what the first pass of this file was.
 *
 * Three voxels across is 75 cm, which is a person with their arms at their
 * sides rather than a person's shoulders; two deep is 50 cm, which is right.
 * The figure **faces +z**, and everything downstream depends on that: the crowd
 * turns each instance to its heading, so a model facing the other way walks the
 * plot backwards.
 *
 * Colours come from `palette.ts` like everything else. Only the skin is a family
 * of its own — the clothes are drawn from the same ramps the buildings are, so
 * the crowd belongs to the resort rather than being pasted onto it.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

/** Voxels a grown person stands: 1.75 m at four voxels to the metre. */
export const ADULT_VOXELS = 7;

/**
 * Voxels a child stands: 1.5 m, which is a child of about eleven.
 *
 * One layer shorter than an adult, and it comes off the legs — the head and the
 * shirt keep their own, so a child is short-legged and big-headed, which is
 * most of what makes a small figure read as a child rather than as an adult
 * further away. A layer shorter again left 25 cm of leg under a 50 cm shirt,
 * which reads as a toddler in grown-up clothes.
 */
export const CHILD_VOXELS = 6;

export interface FigureOptions {
  /** Complexion. Any of the four steps of {@link PALETTE.skin}. */
  readonly skin: Color;
  /** Hair, and the cap it makes from above. */
  readonly hair: Color;
  /** Everything above the waist. */
  readonly shirt: Color;
  /** Everything below it. */
  readonly legs: Color;
  /** How tall the figure stands, in voxels; see the two constants above. */
  readonly height?: number;
}

/**
 * Paints one figure with its feet at `y = 0`, filling 3 x 2 x `height` voxels.
 *
 * The layer heights are derived from `height` rather than listed, so a child is
 * the same figure two voxels shorter instead of a second builder that has to be
 * kept in step with this one. Hair and head are always one layer each — they are
 * the two the camera sees — and the body gives up whatever is left.
 */
export function figure(b: VoxelBuilder, o: FigureOptions): void {
  const height = o.height ?? ADULT_VOXELS;
  if (height < 4) throw new Error(`A figure needs at least four voxels, not ${height}`);

  // Hair, head and shirt take a fixed number of layers and the legs take what is
  // left, which is what makes a child the same figure shortened rather than a
  // second builder to keep in step with this one. A child ends up with big head,
  // short legs, which is a child.
  const hairY = height - 1;
  const headY = height - 2;
  const shirtY = height - 4;

  // Legs, with the gap between them that is the only thing telling the eye there
  // are two. One voxel of gap out of three is as narrow as this grid goes.
  for (const x of [0, 2]) b.box(x, x, 0, shirtY - 1, 0, 1, o.legs);

  b.box(0, 2, shirtY, headY - 1, 0, 1, o.shirt);

  // The head, one voxel across and centred. See the note at the top of the file:
  // this narrowing is what the whole figure is built around.
  b.box(1, 1, headY, headY, 0, 1, o.skin);
  b.box(1, 1, hairY, hairY, 0, 1, o.hair);
}

/**
 * The clothing colours a person may be dressed in.
 *
 * Named here rather than picked in each model so that the crowd is one wardrobe
 * — and so that the thing that eventually dresses a person by their attributes
 * has a list to draw from. Every one is a step of a ramp the buildings already
 * use; see the note at the top of the file.
 */
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
