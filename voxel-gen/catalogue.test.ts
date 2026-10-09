import { describe, expect, it } from 'vitest';
import { catalogueFacts } from './catalogue.ts';
import facts from './facts.json';
import { buildModel, defineModel, factsOf, turnlessOf, type VoxelBuilder } from './voxelgen.ts';

describe('factsOf', () => {
  const model = buildModel(
    defineModel({
      id: 'stack',
      label: 'Stack',
      category: 'grounds',
      tiles: { x: 1, z: 1 },
      build: (b) => {
        b.set(0, 1, 0, 0x0000ff);
        b.set(0, 0, 0, 0xff0000);
      },
      canopy: {
        open: (b) => b.set(1, 2, 0, 0x00ff00),
        furled: (b) => b.set(1, 1, 0, 0x00ff00),
      },
    }),
  );
  const stack = factsOf(model);

  it('counts the voxels and leaves them behind', () => {
    expect(stack.voxelCount).toBe(2);
    expect(stack.dayVoxelCount).toBe(3);
    expect(stack).not.toHaveProperty('voxels');
    expect(stack).not.toHaveProperty('canopy');
  });

  it('breaks a tie for the swatch towards the lowest voxel, not the first painted', () => {
    expect(stack.dominantColor).toBe(0xff0000);
  });
});

const tile = (build: (b: VoxelBuilder) => void) =>
  buildModel(
    defineModel({ id: 'tile', label: 'Tile', category: 'grounds', tiles: { x: 1, z: 1 }, build }),
  );

describe('turnlessOf', () => {
  it('finds a model a quarter turn leaves alike', () => {
    expect(turnlessOf(tile((b) => b.box(0, 3, 0, 1, 0, 3, 0x00ff00)))).toBe(true);
  });

  it('tells a model with a front from one without', () => {
    const fronted = tile((b) => {
      b.box(0, 3, 0, 0, 0, 3, 0x00ff00);
      b.set(1, 1, 0, 0xff0000);
    });
    expect(turnlessOf(fronted)).toBe(false);
  });

  it('turns colour along with shape', () => {
    const striped = tile((b) => {
      b.box(0, 1, 0, 0, 0, 1, 0x00ff00);
      b.box(0, 1, 0, 0, 1, 1, 0xff0000);
    });
    expect(turnlessOf(striped)).toBe(false);
  });

  it('needs a square footprint', () => {
    expect(turnlessOf(tile((b) => b.box(0, 3, 0, 0, 0, 1, 0x00ff00)))).toBe(false);
  });

  it('finds the hedge alike, so a finger paints a row of it', () => {
    expect(facts.types.find((type) => type.model.id === 'hedge')?.model.turnless).toBe(true);
  });

  it('finds the bench has a front', () => {
    expect(facts.types.find((type) => type.model.id === 'bench')?.model.turnless).toBe(false);
  });
});

describe('the committed facts', () => {
  it('matches what the art builds today; run pnpm models:facts after changing a model', () => {
    expect(facts).toEqual(catalogueFacts());
  });

  it('gives every variant an original', () => {
    const originals = new Set(
      facts.types.filter((type) => type.model.id === type.family).map((type) => type.model.id),
    );
    for (const type of facts.types) expect(originals).toContain(type.family);
  });
});
