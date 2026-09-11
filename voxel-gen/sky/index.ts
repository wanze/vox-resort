/**
 * The sky registry: the art that is neither placed nor walked, but flown.
 *
 * A third registry, and here for the reason the people are in a second one. A
 * balloon has no tile footprint to claim, must never be offered on the build
 * palette and must not be stood on the plot by the generator — which asserts
 * that it can place the whole of `OBJECT_TYPES`. Keeping the balloons out of
 * that list leaves it meaning exactly what it has always meant: the things that
 * stand on tiles.
 *
 * All three registries feed the same meshing pipeline, because a balloon is
 * meshed exactly the way a cottage is. What is different about a balloon is only
 * what moves it: see `features/balloons/`.
 */

import type { VoxelModelSource } from '../voxelgen.ts';
import balloon_amber from './balloon-amber.ts';
import balloon_bloom from './balloon-bloom.ts';
import balloon_paper from './balloon-paper.ts';

export const SKY_SOURCES: readonly VoxelModelSource[] = [
  balloon_bloom,
  balloon_amber,
  balloon_paper,
];
