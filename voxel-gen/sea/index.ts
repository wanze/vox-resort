/**
 * The sea registry: the art that floats.
 *
 * A fourth registry, and here for the reason the people are in a second one and
 * the balloons in a third. Nothing afloat has a tile footprint to claim, none of
 * it may be offered on the build palette, and none of it may be stood on the
 * plot by the generator — which asserts that it can place the whole of
 * `OBJECT_TYPES`, and which would throw on a boat the moment it tried, because
 * `layoutResort` refuses anything standing in the sea. Keeping the bay's craft
 * out of that list leaves it meaning what it has always meant: the things that
 * stand on tiles.
 *
 * All four registries feed the same meshing pipeline — a boat is meshed exactly
 * the way a cottage is. What is different about a boat is only what moves it:
 * see `features/sea/`.
 *
 * **The buoy is declared first, and the craft after it.** The flotilla draws a
 * buoy at every mooring and a craft for everything else afloat, and it tells the
 * two apart by the index into this list — exactly as a balloon's `variant`
 * indexes the sky. {@link BUOY_INDEX} is that index, named here rather than
 * written as a `0` in `src/`, so the order is a fact about the registry and one
 * an `objectTypes.test.ts` case holds. {@link PEDALO_INDEX} names the other
 * entry `src/` has to pick out: the craft the rental hut lets out, and so the
 * one with somewhere to go home to.
 */

import type { VoxelModelSource } from '../voxelgen.ts';
import buoy from './buoy.ts';
import pedalo from './pedalo.ts';
import rowboat from './rowboat.ts';
import sailboat from './sailboat.ts';

/** Where the buoy sits in {@link SEA_SOURCES}; everything after it is a craft. */
export const BUOY_INDEX = 0;

/**
 * Where the pedalo sits, which is the one craft the resort *hires out*.
 *
 * Named for the same reason {@link BUOY_INDEX} is: the bay steers its hire boats
 * home to the rental hut and lets everything else drift, and which of these is
 * which is a fact about the registry rather than a number in `src/`. See
 * `features/sea/domain/flotilla.ts`.
 */
export const PEDALO_INDEX = 3;

export const SEA_SOURCES: readonly VoxelModelSource[] = [buoy, rowboat, sailboat, pedalo];
