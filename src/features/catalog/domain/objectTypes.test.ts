import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES } from '../../../../voxel-gen/models/index.ts';
import { PALETTE } from '../../../../voxel-gen/palette.ts';
import { BUOY_INDEX } from '../../../../voxel-gen/sea/index.ts';
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
  PAINTED_MODELS,
  PEOPLE_MODELS,
  SEA_MODELS,
  SKY_MODELS,
  windowsByModelId,
} from './objectTypes';

describe('windowsByModelId', () => {
  it('names the buildings, and only what they glaze with', () => {
    const windows = windowsByModelId();
    expect(windows.size).toBeGreaterThan(6);
    for (const [id, colors] of windows) {
      const model = objectTypeById(id).model;
      expect(colors.size).toBeGreaterThan(0);
      const painted = new Set(model.voxels.map((voxel) => voxel.color));
      for (const color of colors) {
        expect(painted.has(color), `${id} declares a window colour it never paints`).toBe(true);
      }
    }
  });

  it('glazes the hotel and leaves the palm alone', () => {
    const windows = windowsByModelId();
    expect(windows.get('hotel')).toContain(PALETTE.glass.base);
    expect(windows.has('palm')).toBe(false);
    expect(windows.has('street-lamp')).toBe(false);
  });

  it('never calls a colour both a window and a glow', () => {
    // They are two different geometries, and the split reads the emissive set
    // first — so a colour in both would silently never be a window.
    const emissive = emissiveByModelId();
    for (const [id, colors] of windowsByModelId()) {
      for (const color of colors) {
        expect(emissive.get(id)?.has(color) ?? false, `${id} paints ${color} twice over`).toBe(
          false,
        );
      }
    }
  });
});

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

describe('PAINTED_MODELS', () => {
  it('is the catalogue, the crowd, the sky and the sea, and nothing twice', () => {
    expect(PAINTED_MODELS).toHaveLength(
      OBJECT_TYPES.length + PEOPLE_MODELS.length + SKY_MODELS.length + SEA_MODELS.length,
    );
    expect(new Set(PAINTED_MODELS.map((model) => model.id)).size).toBe(PAINTED_MODELS.length);
  });

  it('keeps the balloons out of the catalogue, which is what they are apart from', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(SKY_MODELS.length).toBeGreaterThan(0);
    for (const balloon of SKY_MODELS) {
      expect(catalogue.has(balloon.id), `${balloon.id} is in the catalogue too`).toBe(false);
      expect(balloon.category).toBe('sky');
      // A balloon is a lit paper envelope, and it is nothing if it does not glow.
      expect(balloon.emissive.length).toBeGreaterThan(0);
    }
  });

  it('keeps the people out of the catalogue, which is what they are apart from', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(PEOPLE_MODELS.length).toBeGreaterThan(0);
    for (const person of PEOPLE_MODELS) {
      expect(catalogue.has(person.id), `${person.id} is in the catalogue too`).toBe(false);
      expect(person.category).toBe('people');
    }
  });

  it('keeps the bay out of the catalogue, and declares the buoy first', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(SEA_MODELS.length).toBeGreaterThan(1);
    for (const afloat of SEA_MODELS) {
      expect(catalogue.has(afloat.id), `${afloat.id} is in the catalogue too`).toBe(false);
      expect(afloat.category).toBe('sea');
    }
    // The flotilla draws a buoy at every mooring and a craft for everything
    // else, and it tells the two apart by this index. See `voxel-gen/sea/`.
    expect(SEA_MODELS[BUOY_INDEX]?.id).toBe('buoy');
  });
});

describe('emissiveByModelId', () => {
  it('lists only the models that declare a glowing colour', () => {
    const emissive = emissiveByModelId();
    expect(emissive.has('street-lamp')).toBe(true);
    expect(emissive.has('cottage')).toBe(false);
  });

  it('only names colours the model actually paints with', () => {
    // Looked up in `PAINTED_MODELS` rather than in the catalogue, because that
    // is what the lookup is now derived from: a glowing person would otherwise
    // throw here rather than fail.
    for (const [id, colors] of emissiveByModelId()) {
      const model = PAINTED_MODELS.find((candidate) => candidate.id === id);
      const painted = new Set(model!.voxels.map((voxel) => voxel.color));
      for (const color of colors) expect(painted.has(color)).toBe(true);
    }
  });
});

describe('OBJECT_TYPES', () => {
  it('covers every hand-authored model', () => {
    expect(OBJECT_TYPES.length).toBe(58);
  });

  it('keeps the drafts out of the catalogue, so nothing offers or places them', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(DRAFT_SOURCES.length).toBeGreaterThan(0);
    for (const draft of DRAFT_SOURCES) {
      expect(catalogue.has(draft.id), `${draft.id} is in the catalogue`).toBe(false);
    }
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
    // Collected rather than asserted per voxel: the catalogue is three quarters
    // of a million of them, and an expectation each took this test to the far
    // side of the runner's timeout on its own.
    const outside = new Set<number>();
    for (const type of OBJECT_TYPES) {
      for (const voxel of type.model.voxels) {
        if (voxel.color < 0 || voxel.color > 0xffffff) outside.add(voxel.color);
      }
    }
    expect([...outside]).toEqual([]);
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

  it('offers one paving tool, not the four kinds of paving it lays', () => {
    // Picked by hand, a flight is a staircase up the middle of a lawn, decking
    // is a jetty over grass, and a jetty is decking over a lawn. A path is what
    // you draw; the ground decides which of the four it comes out as. See
    // `paving.ts`.
    expect(offered()).toContain('path');
    expect(offered()).not.toContain('stairs');
    expect(offered()).not.toContain('boardwalk');
    expect(offered()).not.toContain('jetty');
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
  it('registers one material per distinct colour the app paints with', () => {
    const colors = new Set(
      PAINTED_MODELS.flatMap((model) => model.voxels.map((voxel) => voxel.color)),
    );
    expect(allMaterials()).toHaveLength(colors.size);
    expect(new Set(allMaterials().map((material) => material.key)).size).toBe(colors.size);
  });

  it('registers the skin the crowd is painted in, which nothing else paints', () => {
    // The one family no building uses, and the reason the material set is
    // derived from both registries rather than from the catalogue: without it
    // the scratch writes ask the mesher for a voxel that was never registered,
    // and a person comes out miscoloured or not at all. See `docs/crowd.md`.
    const registered = new Set(allMaterials().map((material) => material.key));
    for (const tone of Object.values(PALETTE.skin)) {
      expect(registered.has(materialKeyFor(tone)), `skin #${tone.toString(16)}`).toBe(true);
    }
    const catalogue = new Set(
      OBJECT_TYPES.flatMap((type) => type.model.voxels.map((voxel) => voxel.color)),
    );
    expect(Object.values(PALETTE.skin).some((tone) => catalogue.has(tone))).toBe(false);
  });

  it('stays under the material ceiling the mesher encodes in a byte', () => {
    // DVE writes a submesh's material as a Uint8 and registers six materials of
    // its own ahead of ours, so the 251st colour in the catalogue wraps back
    // onto `dve_solid` and the mesher hands its faces back under a material
    // nothing here has ever heard of. Probed by registering colours until that
    // happened: 250 is ours, 251 came back as `dve_solid`.
    //
    // The palette is what keeps this in hand — see `voxel-gen/palette.ts`. It
    // was 234 before the palette existed, and every model that has its style
    // pass gives colours back.
    expect(allMaterials().length).toBeLessThanOrEqual(250);
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
