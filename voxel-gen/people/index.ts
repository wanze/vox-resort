/**
 * The people registry: every figure the crowd is drawn from.
 *
 * Deliberately *not* `models/index.ts`. A person does not fill the tile
 * footprint every object in the catalogue is authored to fill, must never be
 * offered on the build palette, and must not be stood on the plot by the
 * generator — which asserts that it can place the whole catalogue. Keeping
 * people here leaves `OBJECT_TYPES` meaning exactly what it means today: the
 * things that stand on tiles.
 *
 * Both registries feed the same meshing pipeline, because a person is meshed
 * exactly the way a cottage is. See `docs/crowd.md`.
 */

import type { VoxelModelSource } from '../voxelgen.ts';
import child from './child.ts';
import guest_a from './guest-a.ts';
import guest_b from './guest-b.ts';
import guest_c from './guest-c.ts';

export const PEOPLE_SOURCES: readonly VoxelModelSource[] = [guest_a, guest_b, guest_c, child];
