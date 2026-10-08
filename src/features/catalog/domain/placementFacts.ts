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

// Scaled by fill so a street lamp does not shade the sky bake like a pillar.
const DENSITY_PER_TYPE = new Map(
  OBJECT_TYPES.map((type) => [
    type.id,
    type.model.dayVoxelCount / Math.max(1, type.model.width * type.model.height * type.model.depth),
  ]),
);

// Turned against the model's own size: the placement's extent is already turned, and
// turning against it would move the light out of its lantern.
export function lightsOf(placement: Placement): readonly ModelLight[] {
  const { model } = objectTypeById(placement.id);
  return rotateLights(model.lights, model.width, model.depth, placement.rotation);
}

// A fire pit's light, at its hearth and turned as lightsOf turns a lamp; null for anything else.
export function hearthOf(placement: Placement): ModelLight | null {
  const { model } = objectTypeById(placement.id);
  const hearth = model.venue?.hearth;
  if (!hearth) return null;
  const light = { x: hearth.x, y: hearth.y, z: hearth.z, ...hearth.light };
  return rotateLights([light], model.width, model.depth, placement.rotation)[0]!;
}

// The model's own size, for the same reason as in lightsOf.
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

export function casterOf(placement: Placement): ShadowCaster {
  return { ...placement, height: objectTypeTop(placement.id) };
}

export function blobOf(placement: Placement): BlobShadow | null {
  return blobShadowFor(casterOf(placement));
}
