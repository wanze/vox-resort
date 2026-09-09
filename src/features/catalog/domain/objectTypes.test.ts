import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { materialIdFor, materialKeyFor, materialsForColors } from './materials';
import {
  allMaterials,
  emissiveByModelId,
  materialColorsById,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeGroups,
  objectTypeTop,
} from './objectTypes';

describe('model lights', () => {
  it('declares a light on the street lamp, inside its own bounding box', () => {
    const lamp = objectTypeById('street-lamp').model;
    expect(lamp.lights).toHaveLength(1);
    const [light] = lamp.lights;
    expect(light!.x).toBeGreaterThanOrEqual(0);
    expect(light!.x).toBeLessThan(lamp.width);
    expect(light!.y).toBeLessThan(lamp.height);
    expect(light!.z).toBeLessThan(lamp.depth);
  });

  it('keeps every declared light inside the model it belongs to', () => {
    for (const type of OBJECT_TYPES) {
      for (const light of type.model.lights) {
        expect(light.x).toBeGreaterThanOrEqual(0);
        expect(light.y).toBeGreaterThanOrEqual(0);
        expect(light.z).toBeGreaterThanOrEqual(0);
        expect(light.x).toBeLessThan(type.model.width);
        expect(light.y).toBeLessThan(type.model.height);
        expect(light.z).toBeLessThan(type.model.depth);
        expect(light.intensity).toBeGreaterThan(0);
        expect(light.distance).toBeGreaterThan(0);
      }
    }
  });

  it('puts at least one light on the plot', () => {
    expect(OBJECT_TYPES.some((type) => type.model.lights.length > 0)).toBe(true);
  });
});

describe('emissiveByModelId', () => {
  it('lists only the models that declare a glowing colour', () => {
    const emissive = emissiveByModelId();
    expect(emissive.has('street-lamp')).toBe(true);
    expect(emissive.has('cottage')).toBe(false);
  });

  it('only names colours the model actually paints with', () => {
    for (const [id, colors] of emissiveByModelId()) {
      const painted = new Set(objectTypeById(id).model.voxels.map((voxel) => voxel.color));
      for (const color of colors) expect(painted.has(color)).toBe(true);
    }
  });
});

describe('OBJECT_TYPES', () => {
  it('covers every hand-authored model', () => {
    expect(OBJECT_TYPES.length).toBe(36);
  });

  it('uses unique ids and labels', () => {
    expect(new Set(OBJECT_TYPES.map((type) => type.id)).size).toBe(OBJECT_TYPES.length);
    expect(new Set(OBJECT_TYPES.map((type) => type.label)).size).toBe(OBJECT_TYPES.length);
  });

  it('starts every model at its own corner', () => {
    // Reduced rather than spread: the largest models paint hundreds of
    // thousands of voxels, which overflows the stack as Math.min arguments.
    for (const type of OBJECT_TYPES) {
      const model = type.model;
      expect(model.voxels.length).toBeGreaterThan(0);
      const lo = { x: Infinity, y: Infinity, z: Infinity };
      const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const voxel of model.voxels) {
        for (const axis of ['x', 'y', 'z'] as const) {
          lo[axis] = Math.min(lo[axis], voxel[axis]);
          hi[axis] = Math.max(hi[axis], voxel[axis]);
        }
      }
      expect(lo).toEqual({ x: 0, y: 0, z: 0 });
      expect(hi).toEqual({ x: model.width - 1, y: model.height - 1, z: model.depth - 1 });
    }
  });

  it('keeps every model inside the tiles it claims', () => {
    for (const type of OBJECT_TYPES) {
      expect(type.model.tiles.x).toBeGreaterThan(0);
      expect(type.model.tiles.z).toBeGreaterThan(0);
      expect(type.model.width).toBeLessThanOrEqual(type.model.tiles.x * TILE_VOXELS);
      expect(type.model.depth).toBeLessThanOrEqual(type.model.tiles.z * TILE_VOXELS);
    }
  });

  it('paints only 24-bit colours', () => {
    for (const type of OBJECT_TYPES) {
      for (const voxel of type.model.voxels) {
        expect(voxel.color).toBeGreaterThanOrEqual(0);
        expect(voxel.color).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('takes the HUD swatch from the colour a model uses most', () => {
    const bungalow = objectTypeById('bungalow');
    const counts = new Map<number, number>();
    for (const voxel of bungalow.model.voxels) {
      counts.set(voxel.color, (counts.get(voxel.color) ?? 0) + 1);
    }
    const most = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0];
    expect(bungalow.color).toBe(most);
  });

  it('reports the highest occupied layer of a type', () => {
    expect(objectTypeTop('path')).toBe(objectTypeById('path').model.height);
  });

  it('rejects unknown ids', () => {
    expect(() => objectTypeById('casino')).toThrow(/casino/);
  });
});

/** Every type the palette puts on a shelf, in the order it shows them. */
const offered = (): string[] =>
  objectTypeGroups().flatMap((group) => group.types.map((type) => type.id));

describe('objectTypeGroups', () => {
  it('offers every model the ground does not decide for you', () => {
    const picked = new Set(offered());
    const decided = OBJECT_TYPES.filter((type) => type.model.groundDecides).map((type) => type.id);
    expect(picked.size + decided.length).toBe(OBJECT_TYPES.length);
    for (const id of decided) expect(picked.has(id)).toBe(false);
  });

  it('offers one paving tool, not the three kinds of paving it lays', () => {
    // Picked by hand, a flight is a staircase up the middle of a lawn and
    // decking is a jetty over grass. A path is what you draw; the ground decides
    // which of the three it comes out as. See `paving.ts`.
    expect(offered()).toContain('path');
    expect(offered()).not.toContain('stairs');
    expect(offered()).not.toContain('boardwalk');
  });

  it('groups the rest under the shelf its model declares, in registry order', () => {
    for (const group of objectTypeGroups()) {
      expect(group.types.length).toBeGreaterThan(0);
      expect(group.types.map((type) => type.id)).toEqual(
        OBJECT_TYPES.filter(
          (type) => type.category === group.category && !type.model.groundDecides,
        ).map((type) => type.id),
      );
    }
  });
});

describe('materials', () => {
  it('registers one material per distinct colour in the catalogue', () => {
    const colors = new Set(
      OBJECT_TYPES.flatMap((type) => type.model.voxels.map((voxel) => voxel.color)),
    );
    expect(allMaterials()).toHaveLength(colors.size);
    expect(new Set(allMaterials().map((material) => material.key)).size).toBe(colors.size);
  });

  it('maps every material id to its colour', () => {
    const colors = materialColorsById();
    expect(colors.size).toBe(allMaterials().length);
    for (const material of allMaterials()) {
      expect(colors.get(materialIdFor(material.key))).toBe(material.color);
    }
  });

  it('keys materials by their padded hex colour', () => {
    expect(materialKeyFor(0x0a1b2c)).toBe('0a1b2c');
    expect(materialsForColors([0x112233, 0x112233, 0x445566])).toEqual([
      { key: '112233', color: 0x112233 },
      { key: '445566', color: 0x445566 },
    ]);
  });

  it('rejects a colour outside the 24-bit range', () => {
    expect(() => materialKeyFor(0x1000000)).toThrow(/24-bit/);
  });
});
