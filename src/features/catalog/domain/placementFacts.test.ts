import { describe, expect, it } from 'vitest';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { place, type Placement } from '../../layout/domain/resortLayout';
import { PATH_ID } from '../../layout/domain/resortPlan';
import { rotateLights, type Rotation } from '../../layout/domain/rotation';
import { MIN_CAST_HEIGHT } from '../../rendering/domain/blobShadows';
import { OBJECT_TYPES, objectTypeById, type ObjectTypeDefinition } from './objectTypes';
import { blobOf, casterOf, lightsOf, occluderOf, seatSiteOf } from './placementFacts';

function standing(type: ObjectTypeDefinition, rotation: Rotation = 0): Placement {
  return place(layoutItemFor(type), `${type.id}#1`, 3, 5, rotation, 1);
}

function typeWhere(predicate: (type: ObjectTypeDefinition) => boolean): ObjectTypeDefinition {
  const found = OBJECT_TYPES.find(predicate);
  if (!found) throw new Error('no catalogue type fits this fixture');
  return found;
}

const oblong = (type: ObjectTypeDefinition) => type.model.width !== type.model.depth;

const LIT = typeWhere((type) => {
  const { lights, width, depth } = type.model;
  if (lights.length === 0 || !oblong(type)) return false;
  const right = rotateLights(lights, width, depth, 1);
  const wrong = rotateLights(lights, depth, width, 1);
  return JSON.stringify(right) !== JSON.stringify(wrong);
});

describe('lightsOf', () => {
  it("returns an unturned model's lights as the art declared them", () => {
    expect(lightsOf(standing(LIT))).toEqual(LIT.model.lights);
  });

  it("turns lights against the model's own size, not the placement's", () => {
    const { lights, width, depth } = LIT.model;
    const turned = standing(LIT, 1);
    expect([turned.width, turned.depth]).toEqual([depth, width]);
    expect(lightsOf(turned)).toEqual(rotateLights(lights, width, depth, 1));
    expect(lightsOf(turned)).not.toEqual(rotateLights(lights, turned.width, turned.depth, 1));
  });

  it('returns no lights for a model that declares none', () => {
    const dark = typeWhere((type) => type.model.lights.length === 0);
    expect(lightsOf(standing(dark, 2))).toHaveLength(0);
  });
});

describe('seatSiteOf', () => {
  it("carries the model's own size and passes the turn through", () => {
    const seated = typeWhere((type) => type.model.seats.length > 0 && oblong(type));
    const turned = standing(seated, 3);
    expect(seatSiteOf(turned)).toEqual({
      x: turned.x,
      z: turned.z,
      y: turned.y,
      rotation: 3,
      width: seated.model.width,
      depth: seated.model.depth,
      seats: seated.model.seats,
    });
    expect(seatSiteOf(turned).width).not.toBe(turned.width);
  });

  it('yields no seats for a model that declares none', () => {
    const standingOnly = typeWhere((type) => type.model.seats.length === 0);
    expect(seatSiteOf(standing(standingOnly)).seats).toHaveLength(0);
  });
});

describe('occluderOf', () => {
  it('takes x and z from the turned placement and the height from the model', () => {
    const type = typeWhere((candidate) => oblong(candidate) && candidate.model.height > 0);
    const turned = standing(type, 1);
    const occluder = occluderOf(turned);
    expect(occluder).toMatchObject({
      key: turned.key,
      minX: turned.x,
      maxX: turned.x + turned.width,
      minZ: turned.z,
      maxZ: turned.z + turned.depth,
    });
    expect(occluder.maxX - occluder.minX).toBe(type.model.depth);
    expect(turned.y).toBeGreaterThan(0);
    expect(occluder.minY).toBe(turned.y);
    expect(occluder.maxY).toBe(turned.y + type.model.height);
  });

  it('gives every catalogue type a density that is a fraction of its box', () => {
    for (const type of OBJECT_TYPES) {
      const { density } = occluderOf(standing(type));
      expect(density, type.id).toBeGreaterThan(0);
      expect(density, type.id).toBeLessThanOrEqual(1);
    }
  });

  it('refuses an id the catalogue does not know', () => {
    const stray = { ...standing(LIT), id: 'no-such-object' };
    expect(() => occluderOf(stray)).toThrow('no-such-object');
  });
});

describe('casterOf', () => {
  it('keeps every placement field and adds the model height', () => {
    const turned = standing(LIT, 2);
    expect(casterOf(turned)).toEqual({ ...turned, height: LIT.model.height });
  });
});

describe('blobOf', () => {
  it('throws no shadow from a path slab, and one from a building', () => {
    expect(objectTypeById(PATH_ID).model.height).toBeLessThan(MIN_CAST_HEIGHT);
    expect(blobOf(standing(objectTypeById(PATH_ID)))).toBeNull();
    expect(objectTypeById('hotel').model.height).toBeGreaterThanOrEqual(MIN_CAST_HEIGHT);
    expect(blobOf(standing(objectTypeById('hotel')))).not.toBeNull();
  });

  it("centres the shadow on the placement's footprint", () => {
    const turned = standing(objectTypeById('hotel'), 1);
    const blob = blobOf(turned)!;
    expect(blob.key).toBe(turned.key);
    expect(blob.x).toBe(turned.x + turned.width / 2);
    expect(blob.z).toBe(turned.z + turned.depth / 2);
    expect(blob.y).toBe(turned.y);
  });
});
