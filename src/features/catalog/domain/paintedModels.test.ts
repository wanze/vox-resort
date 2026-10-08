import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../../voxel-gen/palette.ts';
import { allVoxelsOf } from '../../../../voxel-gen/voxelgen.ts';
import { materialIdFor, materialKeyFor } from './materials';
import {
  LITTER_MODELS,
  OBJECT_TYPES,
  objectTypeById,
  PEOPLE_MODELS,
  PROP_MODELS,
  SEA_MODELS,
  SKY_MODELS,
  STAFF_MODELS,
} from './objectTypes';
import {
  emissiveByModelId,
  materialColorsOf,
  materialsOf,
  paintedCatalogue,
  paintedModelsOf,
  windowsByModelId,
} from './paintedModels';

const PAINTED = paintedModelsOf(paintedCatalogue());
const TYPES = paintedCatalogue().types.map((type) => type.model);
const paintedById = (id: string) => PAINTED.find((model) => model.id === id)!;

describe('windowsByModelId', () => {
  it('names the buildings, and only what they glaze with', () => {
    const windows = windowsByModelId(PAINTED);
    expect(windows.size).toBeGreaterThan(6);
    for (const [id, colors] of windows) {
      const model = paintedById(id);
      expect(colors.size).toBeGreaterThan(0);
      const painted = new Set(model.voxels.map((voxel) => voxel.color));
      for (const color of colors) {
        expect(painted.has(color), `${id} declares a window colour it never paints`).toBe(true);
      }
    }
  });

  it('glazes the hotel and leaves the palm alone', () => {
    const windows = windowsByModelId(PAINTED);
    expect(windows.get('hotel')).toContain(PALETTE.glass.base);
    expect(windows.has('palm')).toBe(false);
    expect(windows.has('street-lamp')).toBe(false);
  });

  it('never calls a colour both a window and a glow', () => {
    const emissive = emissiveByModelId(PAINTED);
    for (const [id, colors] of windowsByModelId(PAINTED)) {
      for (const color of colors) {
        expect(emissive.get(id)?.has(color) ?? false, `${id} paints ${color} twice over`).toBe(
          false,
        );
      }
    }
  });
});

describe('paintedModelsOf', () => {
  it('is the catalogue, the crowd, the staff, the sky, the sea and the litter, and nothing twice', () => {
    expect(PAINTED).toHaveLength(
      OBJECT_TYPES.length +
        PEOPLE_MODELS.length +
        STAFF_MODELS.length +
        SKY_MODELS.length +
        SEA_MODELS.length +
        LITTER_MODELS.length +
        PROP_MODELS.length,
    );
    expect(new Set(PAINTED.map((model) => model.id)).size).toBe(PAINTED.length);
  });
});

describe('emissiveByModelId', () => {
  it('lists only the models that declare a glowing colour', () => {
    const emissive = emissiveByModelId(PAINTED);
    expect(emissive.has('street-lamp')).toBe(true);
    expect(emissive.has('cottage')).toBe(false);
  });

  it('only names colours the model actually paints with', () => {
    for (const [id, colors] of emissiveByModelId(PAINTED)) {
      const painted = new Set(paintedById(id).voxels.map((voxel) => voxel.color));
      for (const color of colors) expect(painted.has(color)).toBe(true);
    }
  });
});

const keyOf = (voxel: { x: number; y: number; z: number }) => `${voxel.x},${voxel.y},${voxel.z}`;

describe('the painted object types', () => {
  it('paints each canopy state beside the model, never into a voxel the model fills', () => {
    const canopied = TYPES.filter((model) => model.canopy !== null);
    expect(canopied.map((model) => model.id)).toContain('sun-lounger');
    for (const model of canopied) {
      const filled = new Set(model.voxels.map(keyOf));
      for (const state of ['open', 'furled'] as const) {
        const painted = model.canopy![state];
        expect(painted.length, `${model.id} ${state}`).toBeGreaterThan(0);
        expect(
          painted.filter((voxel) => filled.has(keyOf(voxel))),
          `${model.id} ${state}`,
        ).toEqual([]);
      }
    }
  });

  it('starts every model at its own corner', () => {
    // Reduced rather than spread: hundreds of thousands of Math.min arguments overflow the stack.
    for (const model of TYPES) {
      expect(model.voxels.length).toBeGreaterThan(0);
      const lo = { x: Infinity, y: Infinity, z: Infinity };
      const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const voxel of allVoxelsOf(model)) {
        for (const axis of ['x', 'y', 'z'] as const) {
          lo[axis] = Math.min(lo[axis], voxel[axis]);
          hi[axis] = Math.max(hi[axis], voxel[axis]);
        }
      }
      expect(lo).toEqual({ x: 0, y: 0, z: 0 });
      expect(hi).toEqual({ x: model.width - 1, y: model.height - 1, z: model.depth - 1 });
    }
  });

  it('paints only 24-bit colours', () => {
    // Collected rather than asserted per voxel: an expectation each exceeds the runner timeout.
    const outside = new Set<number>();
    for (const model of TYPES) {
      for (const voxel of model.voxels) {
        if (voxel.color < 0 || voxel.color > 0xffffff) outside.add(voxel.color);
      }
    }
    expect([...outside]).toEqual([]);
  });

  it('takes the HUD swatch from the colour a model uses most', () => {
    const counts = new Map<number, number>();
    for (const voxel of paintedById('bungalow').voxels) {
      counts.set(voxel.color, (counts.get(voxel.color) ?? 0) + 1);
    }
    const most = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0];
    expect(objectTypeById('bungalow').color).toBe(most);
  });
});

describe('materials', () => {
  const materials = materialsOf(PAINTED);

  it('registers one material per distinct colour the app paints with', () => {
    const colors = new Set(
      PAINTED.flatMap((model) => allVoxelsOf(model).map((voxel) => voxel.color)),
    );
    expect(materials).toHaveLength(colors.size);
    expect(new Set(materials.map((material) => material.key)).size).toBe(colors.size);
  });

  it('registers the skin the crowd is painted in, which nothing else paints', () => {
    const registered = new Set(materials.map((material) => material.key));
    for (const tone of Object.values(PALETTE.skin)) {
      expect(registered.has(materialKeyFor(tone)), `skin #${tone.toString(16)}`).toBe(true);
    }
    const catalogue = new Set(TYPES.flatMap((model) => model.voxels.map((voxel) => voxel.color)));
    expect(Object.values(PALETTE.skin).some((tone) => catalogue.has(tone))).toBe(false);
  });

  it('stays under the material ceiling the mesher encodes in a byte', () => {
    // DVE writes a submesh material as a Uint8 and registers six of its own first, so the
    // 251st colour wraps onto `dve_solid`.
    expect(materials.length).toBeLessThanOrEqual(250);
  });

  it('maps every material id to its colour', () => {
    const colors = materialColorsOf(materials);
    expect(colors.size).toBe(materials.length);
    for (const material of materials) {
      expect(colors.get(materialIdFor(material.key))).toBe(material.color);
    }
  });
});
