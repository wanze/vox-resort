/**
 * A placement, as each of the things that cares about it needs to see it.
 *
 * Everything here is a projection: a placement plus the catalogue goes in, and
 * one subsystem's view of it comes out — its lights, its seats, the box it takes
 * sky from, the shadow it throws. Each of them has to know the same thing, that
 * a placement's extents are already turned but the model's are not, and getting
 * that backwards puts a lantern outside its lamp or a sitter outside their chair.
 *
 * They live together because they share that one rule, and they live in `domain/`
 * because none of them touches an engine and every one of them is worth a test.
 */

import type { ModelLight } from '../../../../voxel-gen/voxelgen.ts';
import type { SeatSite } from '../../crowd/domain/seating';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotateLights } from '../../layout/domain/rotation';
import type { Occluder } from '../../lighting/domain/skyVisibility';
import {
  blobShadowFor,
  type BlobShadow,
  type ShadowCaster,
} from '../../rendering/domain/blobShadows';
import { OBJECT_TYPES, objectTypeById, objectTypeTop } from './objectTypes';

/**
 * How solidly each model fills its own bounding box, 0..1.
 *
 * The sky-visibility bake shades from boxes, and a box is a poor stand-in for a
 * street lamp: scaling its contribution by what the model actually fills is what
 * keeps a pole from shading like a pillar. Derived from the catalogue, so an
 * object added to the art needs no rule written for it here.
 */
const DENSITY_PER_TYPE = new Map(
  OBJECT_TYPES.map((type) => [
    type.id,
    type.model.voxels.length / Math.max(1, type.model.width * type.model.height * type.model.depth),
  ]),
);

/**
 * The lights an object carries, moved to where the way it stands puts them.
 *
 * The model's own size is what the turn is measured against, so this reads the
 * catalogue rather than the placement: a placement's extent is already turned,
 * and turning a light against it would send it out of the lantern it was
 * declared in.
 */
export function lightsOf(placement: Placement): readonly ModelLight[] {
  const { model } = objectTypeById(placement.id);
  return rotateLights(model.lights, model.width, model.depth, placement.rotation);
}

/**
 * An object as its seats see it: where the model's corner is, how high it
 * stands, which way round it is, and the seats the art declared on it.
 *
 * The model's own size goes along with it for the reason it does in
 * {@link lightsOf} — a placement's extent is already turned, and a seat turned
 * against it would seat somebody outside the chair it was declared in. The turn
 * itself is `seating.ts`'s to apply.
 */
export function seatSiteOf(placement: Placement): SeatSite {
  const { model } = objectTypeById(placement.id);
  return {
    x: placement.x,
    z: placement.z,
    y: placement.y,
    rotation: placement.rotation,
    width: model.width,
    depth: model.depth,
    seats: model.seats,
  };
}

/**
 * The box an object stands in, as far as the sky behind it is concerned.
 *
 * The placement's own extents, which are already turned, and the model's height
 * standing on its own terrace. A path slab comes out two voxels tall and is
 * dropped by the bake itself; see `MIN_OCCLUDER_HEIGHT`.
 */
export function occluderOf(placement: Placement): Occluder {
  return {
    key: placement.key,
    minX: placement.x,
    maxX: placement.x + placement.width,
    minY: placement.y,
    maxY: placement.y + objectTypeTop(placement.id),
    minZ: placement.z,
    maxZ: placement.z + placement.depth,
    density: DENSITY_PER_TYPE.get(placement.id) ?? 1,
  };
}

/**
 * An object as its shadow sees it: where it stands, how much ground it claims
 * and how tall it is. The first three are already on the placement, turn
 * included; the height is the model's.
 */
export function casterOf(placement: Placement): ShadowCaster {
  return { ...placement, height: objectTypeTop(placement.id) };
}

/** The shadow an object throws, or null if it is too flat to throw one. */
export function blobOf(placement: Placement): BlobShadow | null {
  return blobShadowFor(casterOf(placement));
}
