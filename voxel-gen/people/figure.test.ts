import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from '../models/index.ts';
import { PALETTE } from '../palette.ts';
import { buildModel, VoxelBuilder } from '../voxelgen.ts';
import {
  ADULT_VOXELS,
  ARM_VOXELS,
  CHILD_VOXELS,
  figure,
  FIGURE_SCALE,
  handHeight,
  hipHeight,
  shoulderHeight,
  WARDROBE,
} from './figure.ts';
import { PEOPLE_SOURCES, STAFF_SOURCES } from './index.ts';

const FINE = 1 / FIGURE_SCALE;

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined => b.get(x, y, z);

const DRESS = {
  skin: PALETTE.skin.base,
  hair: PALETTE.teak.deep,
  shirt: PALETTE.bloom.base,
  sleeves: PALETTE.bloom.shade,
  legs: PALETTE.slate.shade,
} as const;

const drawn = (height: number = ADULT_VOXELS): VoxelBuilder => {
  const b = new VoxelBuilder();
  figure(b, { ...DRESS, height });
  return b;
};

const LEFT_ARM = 0;
const RIGHT_ARM = 5;

function column(b: VoxelBuilder, x: number, z: number): (number | undefined)[] {
  const top = Math.max(...[...b].map((voxel) => voxel.y));
  return Array.from({ length: top + 1 }, (_, y) => at(b, x, y, z));
}

describe('figure', () => {
  it('stands three across, two deep and as tall as it is asked for, in world voxels', () => {
    for (const height of [ADULT_VOXELS, CHILD_VOXELS, 5]) {
      const model = buildModel({
        id: 'probe',
        label: 'Probe',
        category: 'people',
        tiles: { x: 1, z: 1 },
        scale: FIGURE_SCALE,
        build: (b) => figure(b, { ...DRESS, height }),
      });
      const world = [model.width, model.height, model.depth].map((size) => size * FIGURE_SCALE);
      expect(world, `height ${height}`).toEqual([3, height, 2]);
    }
  });

  it('narrows the head to one voxel over shoulders two across', () => {
    const b = drawn();
    const shoulder = shoulderHeight(ADULT_VOXELS) * FINE;
    for (let x = 0; x < 6; x++) {
      const head = x === 2 || x === 3;
      expect(at(b, x, shoulder, 0) !== undefined, `head at ${x}`).toBe(head);
      expect(at(b, x, shoulder - 1, 0) !== undefined, `chest at ${x}`).toBe(x >= 1 && x <= 4);
    }
    expect(at(b, 2, ADULT_VOXELS * FINE - 1, 0)).toBe(DRESS.hair);
    expect(at(b, 2, shoulder, 0)).toBe(DRESS.skin);
  });

  it('paints the arms apart from the chest, so they mesh as their own faces', () => {
    for (const height of [ADULT_VOXELS, CHILD_VOXELS]) {
      const b = drawn(height);
      for (let y = hipHeight(height) * FINE; y < shoulderHeight(height) * FINE; y++) {
        expect(at(b, 1, y, 1), `chest at ${y}`).toBe(DRESS.shirt);
        for (const x of [LEFT_ARM, RIGHT_ARM]) {
          expect(at(b, x, y, 1), `arm at ${x}, ${y}`).not.toBe(DRESS.shirt);
        }
      }
    }
  });

  it('gives the forearm twice the sleeve’s length, from the shoulder to beside the thigh', () => {
    for (const height of [ADULT_VOXELS, CHILD_VOXELS]) {
      for (const x of [LEFT_ARM, RIGHT_ARM]) {
        const arm = column(drawn(height), x, 1);
        const sleeve = arm.filter((color) => color === DRESS.sleeves).length;
        const forearm = arm.filter((color) => color === DRESS.skin).length;
        expect(forearm, `height ${height}`).toBe(2 * sleeve);
        expect(sleeve + forearm).toBe(ARM_VOXELS * FINE);
        expect(arm.findIndex((color) => color !== undefined)).toBe(handHeight(height) * FINE);
        expect(handHeight(height)).toBeLessThan(hipHeight(height));
        expect(arm.slice(shoulderHeight(height) * FINE).every((color) => color === undefined)).toBe(
          true,
        );
      }
    }
  });

  it('keeps the limbs half a voxel across and one deep, and the body two', () => {
    const b = drawn();
    const hand = handHeight(ADULT_VOXELS) * FINE;
    for (const x of [LEFT_ARM, RIGHT_ARM]) {
      expect([0, 1, 2, 3].map((z) => at(b, x, hand, z) !== undefined)).toEqual([
        false,
        true,
        true,
        false,
      ]);
    }
    expect([0, 1, 2, 3].map((z) => at(b, 1, 0, z) !== undefined)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect([0, 1, 2, 3].every((z) => at(b, 1, hipHeight(ADULT_VOXELS) * FINE, z))).toBe(true);
  });

  it('leaves a gap between the legs, so there are two of them', () => {
    const b = drawn();
    for (let y = 0; y < hipHeight(ADULT_VOXELS) * FINE; y++) {
      expect(at(b, 1, y, 1)).toBe(DRESS.legs);
      expect(at(b, 4, y, 2)).toBe(DRESS.legs);
      expect(at(b, 2, y, 1)).toBeUndefined();
      expect(at(b, 3, y, 2)).toBeUndefined();
    }
  });

  it('takes a child’s missing voxel off the legs, not off the head', () => {
    const child = drawn(CHILD_VOXELS);
    const adult = drawn();
    const fromTop = (b: VoxelBuilder, height: number, rows: number): (number | undefined)[] =>
      column(b, 2, 0).slice(height * FINE - rows);
    expect(fromTop(child, CHILD_VOXELS, 4 * FINE)).toEqual(fromTop(adult, ADULT_VOXELS, 4 * FINE));
    expect(column(child, 1, 1).filter((color) => color === DRESS.legs).length).toBe(
      column(adult, 1, 1).filter((color) => color === DRESS.legs).length - FINE,
    );
  });

  it('refuses a figure with no room for the parts', () => {
    expect(() => figure(new VoxelBuilder(), { ...DRESS, height: 4 })).toThrow(/five voxels/);
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
    for (const source of [...PEOPLE_SOURCES, ...STAFF_SOURCES]) {
      const model = buildModel(source);
      expect(model.scale, model.id).toBe(FIGURE_SCALE);
      expect([model.width * FIGURE_SCALE, model.depth * FIGURE_SCALE], model.id).toEqual([3, 2]);
      expect([CHILD_VOXELS, ADULT_VOXELS], model.id).toContain(model.height * FIGURE_SCALE);
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

  it("dresses no member of staff in a shirt from the guests' wardrobe", () => {
    const worn = new Set(WARDROBE.flatMap((ramp) => Object.values(ramp)));
    const chest = hipHeight(ADULT_VOXELS) * FINE;
    for (const source of STAFF_SOURCES) {
      const model = buildModel(source);
      const shirt = model.voxels.find(
        (voxel) => voxel.x === 1 && voxel.y === chest && voxel.z === 1,
      );
      expect(shirt, source.id).toBeDefined();
      expect(worn.has(shirt!.color), `${source.id} wears a guest's shirt`).toBe(false);
    }
  });

  it('caps every member of staff, each role in a colour of its own', () => {
    const top = ADULT_VOXELS * FINE - 1;
    const caps = STAFF_SOURCES.map((source) => {
      const model = buildModel(source);
      return model.voxels.find((voxel) => voxel.x === 2 && voxel.y === top && voxel.z === 0)!.color;
    });
    expect(new Set(caps).size).toBe(STAFF_SOURCES.length);
    const hair = PEOPLE_SOURCES.map((source) => {
      const model = buildModel(source);
      const height = model.height - 1;
      return model.voxels.find((voxel) => voxel.x === 2 && voxel.y === height && voxel.z === 0)!
        .color;
    });
    for (const cap of caps) expect(hair).not.toContain(cap);
  });
});
