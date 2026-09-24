import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES } from '../../../../voxel-gen/models/index.ts';
import { PALETTE } from '../../../../voxel-gen/palette.ts';
import { BUOY_INDEX } from '../../../../voxel-gen/sea/index.ts';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { materialIdFor, materialKeyFor, materialsForColors } from './materials';
import {
  allMaterials,
  binReachOf,
  bedsOf,
  isGateway,
  LITTER_MODELS,
  emissiveByModelId,
  materialColorsById,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeGroups,
  objectTypeTop,
  PAINTED_MODELS,
  PEOPLE_MODELS,
  sceneryOf,
  SEA_MODELS,
  SKY_MODELS,
  STAFF_MODELS,
  venueOf,
  venueTypes,
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
  it('is the catalogue, the crowd, the staff, the sky, the sea and the litter, and nothing twice', () => {
    expect(PAINTED_MODELS).toHaveLength(
      OBJECT_TYPES.length +
        PEOPLE_MODELS.length +
        STAFF_MODELS.length +
        SKY_MODELS.length +
        SEA_MODELS.length +
        LITTER_MODELS.length,
    );
    expect(new Set(PAINTED_MODELS.map((model) => model.id)).size).toBe(PAINTED_MODELS.length);
  });

  it('keeps the balloons out of the catalogue, which is what they are apart from', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(SKY_MODELS.length).toBeGreaterThan(0);
    for (const balloon of SKY_MODELS) {
      expect(catalogue.has(balloon.id), `${balloon.id} is in the catalogue too`).toBe(false);
      expect(balloon.category).toBe('sky');
      expect(balloon.emissive.length).toBeGreaterThan(0);
    }
  });

  it('keeps the litter out of the catalogue, which is what it is apart from', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(LITTER_MODELS.length).toBeGreaterThan(0);
    for (const piece of LITTER_MODELS) {
      expect(catalogue.has(piece.id), `${piece.id} is in the catalogue too`).toBe(false);
      expect(piece.category).toBe('litter');
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

  it('keeps the staff out of the catalogue and out of the guests', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    const guests = new Set(PEOPLE_MODELS.map((model) => model.id));
    expect(STAFF_MODELS.length).toBeGreaterThan(0);
    for (const worker of STAFF_MODELS) {
      expect(catalogue.has(worker.id), `${worker.id} is in the catalogue too`).toBe(false);
      expect(guests.has(worker.id), `${worker.id} is dealt to guests too`).toBe(false);
      expect(worker.category).toBe('people');
    }
  });

  it('keeps the bay out of the catalogue, and declares the buoy first', () => {
    const catalogue = new Set(OBJECT_TYPES.map((type) => type.id));
    expect(SEA_MODELS.length).toBeGreaterThan(1);
    for (const afloat of SEA_MODELS) {
      expect(catalogue.has(afloat.id), `${afloat.id} is in the catalogue too`).toBe(false);
      expect(afloat.category).toBe('sea');
    }
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
    for (const [id, colors] of emissiveByModelId()) {
      const model = PAINTED_MODELS.find((candidate) => candidate.id === id);
      const painted = new Set(model!.voxels.map((voxel) => voxel.color));
      for (const color of colors) expect(painted.has(color)).toBe(true);
    }
  });
});

describe('OBJECT_TYPES', () => {
  it('covers every hand-authored model', () => {
    expect(OBJECT_TYPES.length).toBe(63);
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
    // Reduced rather than spread: hundreds of thousands of Math.min arguments overflow the stack.
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
    // Collected rather than asserted per voxel: an expectation each exceeds the runner timeout.
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

describe('venues', () => {
  it('reads what a guest can do off the model', () => {
    const hotel = venueOf('hotel');
    expect(hotel?.role).toBe('lodging');
    expect(hotel?.beds).toBe(40);
  });

  it('has nothing to offer at dressing', () => {
    expect(venueOf('bench')).toBeNull();
  });

  it('answers null for an unknown id rather than throwing, unlike objectTypeById', () => {
    expect(venueOf('not-a-model')).toBeNull();
  });

  it('counts the beds a type sleeps, and none where it is not a lodging', () => {
    expect(bedsOf('bungalow')).toBe(4);
    expect(bedsOf('path')).toBe(0);
  });

  it('lists only the types a guest can go to', () => {
    const types = venueTypes();
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) expect(type.venue, type.id).not.toBeNull();
  });

  it('says which types are a way in and out of the resort, and how many there are', () => {
    expect(isGateway('entrance')).toBe(true);
    expect(isGateway('bungalow')).toBe(false);
    expect(isGateway('not-a-model'), 'an unknown id is not a gate').toBe(false);
    for (const type of venueTypes()) expect(isGateway(type.id), type.id).toBe(false);
    const gates = OBJECT_TYPES.filter((type) => isGateway(type.id));
    expect(gates.length, 'a plot nobody can arrive at').toBeGreaterThan(0);
  });

  it('always has somewhere to put people', () => {
    const beds = venueTypes()
      .filter((type) => type.venue!.role === 'lodging')
      .reduce((sum, type) => sum + bedsOf(type.id), 0);
    expect(beds).toBeGreaterThan(0);
  });
});

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
    // DVE writes a submesh material as a Uint8 and registers six of its own first, so the
    // 251st colour wraps onto `dve_solid`.
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

describe('sceneryOf', () => {
  it('keeps every declared scenery above nothing and at most one', () => {
    const dressed = OBJECT_TYPES.filter((type) => sceneryOf(type.id) !== 0);
    expect(dressed.length).toBeGreaterThan(0);
    for (const type of dressed) {
      expect(sceneryOf(type.id), type.id).toBeGreaterThan(0);
      expect(sceneryOf(type.id), type.id).toBeLessThanOrEqual(1);
    }
  });

  it('answers 0 for an unknown id rather than throwing', () => {
    expect(sceneryOf('not-a-model')).toBe(0);
  });
});

describe('binReachOf', () => {
  it('makes the litter bin a bin, and nothing that is not one', () => {
    expect(binReachOf('litter-bin')).toBeGreaterThan(0);
    expect(binReachOf('fountain')).toBe(0);
  });

  it('answers 0 for an unknown id rather than throwing', () => {
    expect(binReachOf('not-a-model')).toBe(0);
  });
});
