import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from '../models/index.ts';
import { PALETTE } from '../palette.ts';
import { buildModel, VoxelBuilder } from '../voxelgen.ts';
import { ADULT_VOXELS, CHILD_VOXELS, figure, WARDROBE } from './figure.ts';
import { PEOPLE_SOURCES } from './index.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

const DRESS = {
  skin: PALETTE.skin.base,
  hair: PALETTE.teak.deep,
  shirt: PALETTE.bloom.base,
  legs: PALETTE.slate.shade,
} as const;

const drawn = (height: number = ADULT_VOXELS): VoxelBuilder => {
  const b = new VoxelBuilder();
  figure(b, { ...DRESS, height });
  return b;
};

describe('figure', () => {
  it('narrows the head to one voxel over shoulders three across', () => {
    const b = drawn();
    for (const z of [0, 1]) {
      expect(at(b, 1, ADULT_VOXELS - 1, z)).toBe(DRESS.hair);
      expect(at(b, 1, ADULT_VOXELS - 2, z)).toBe(DRESS.skin);
      for (const x of [0, 2]) {
        expect(at(b, x, ADULT_VOXELS - 1, z)).toBeUndefined();
        expect(at(b, x, ADULT_VOXELS - 2, z)).toBeUndefined();
      }
      expect(at(b, 0, ADULT_VOXELS - 3, z)).toBe(DRESS.shirt);
      expect(at(b, 2, ADULT_VOXELS - 3, z)).toBe(DRESS.shirt);
    }
  });

  it('leaves a gap between the legs, so there are two of them', () => {
    const b = drawn();
    expect(at(b, 0, 0, 0)).toBe(DRESS.legs);
    expect(at(b, 2, 0, 1)).toBe(DRESS.legs);
    expect(at(b, 1, 0, 0)).toBeUndefined();
    expect(at(b, 1, 2, 1)).toBeUndefined();
  });

  it('stands three across, two deep and as tall as it is asked for', () => {
    for (const height of [ADULT_VOXELS, CHILD_VOXELS, 4]) {
      const model = buildModel({
        id: 'probe',
        label: 'Probe',
        category: 'people',
        tiles: { x: 1, z: 1 },
        build: (b) => figure(b, { ...DRESS, height }),
      });
      expect([model.width, model.height, model.depth], `height ${height}`).toEqual([3, height, 2]);
    }
  });

  it('takes a child’s missing voxel off the legs, not off the head', () => {
    const child = drawn(CHILD_VOXELS);
    expect(at(child, 1, CHILD_VOXELS - 1, 0)).toBe(DRESS.hair);
    expect(at(child, 1, CHILD_VOXELS - 2, 0)).toBe(DRESS.skin);
    expect(at(child, 0, CHILD_VOXELS - 3, 0)).toBe(DRESS.shirt);
    expect(at(child, 0, CHILD_VOXELS - 4, 0)).toBe(DRESS.shirt);
    expect(at(child, 0, 1, 0)).toBe(DRESS.legs);
    expect(at(child, 1, 1, 0)).toBeUndefined();
    expect(child.voxels.size).toBeLessThan(drawn().voxels.size);
  });

  it('refuses a figure with no room for the parts', () => {
    expect(() => figure(new VoxelBuilder(), { ...DRESS, height: 3 })).toThrow(/four voxels/);
  });
});

describe('PEOPLE_SOURCES', () => {
  it('keeps every person out of the catalogue and off the build palette', () => {
    const catalogue = new Set(MODEL_SOURCES.map((source) => source.id));
    for (const source of PEOPLE_SOURCES) {
      expect(source.category, source.id).toBe('people');
      expect(catalogue.has(source.id), `${source.id} is in the catalogue too`).toBe(false);
    }
  });

  it('draws every person as the same figure, at one of the two heights', () => {
    const ids = PEOPLE_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of PEOPLE_SOURCES) {
      const model = buildModel(source);
      expect([model.width, model.depth], model.id).toEqual([3, 2]);
      expect([CHILD_VOXELS, ADULT_VOXELS], model.id).toContain(model.height);
    }
  });

  it('dresses the crowd out of the palette the buildings are painted from', () => {
    // Most buildings are still exempt from the palette, so this only checks that
    // each wardrobe entry is one of the shared ramps.
    const shared = new Set(Object.values(PALETTE));
    for (const ramp of WARDROBE) expect(shared.has(ramp)).toBe(true);
    expect(shared.has(PALETTE.skin), 'skin is a complexion, not something to wear').toBe(true);
    expect(WARDROBE).not.toContain(PALETTE.skin);
    expect(new Set(WARDROBE).size).toBe(WARDROBE.length);
  });

  it('paints every person from the wardrobe and the skin family', () => {
    const allowed = new Set([
      ...WARDROBE.flatMap((ramp) => Object.values(ramp)),
      ...Object.values(PALETTE.skin),
      ...Object.values(PALETTE.thatch),
      ...Object.values(PALETTE.metal),
    ]);
    for (const source of PEOPLE_SOURCES) {
      for (const voxel of buildModel(source).voxels) {
        expect(allowed.has(voxel.color), `${source.id} paints #${voxel.color.toString(16)}`).toBe(
          true,
        );
      }
    }
  });
});
