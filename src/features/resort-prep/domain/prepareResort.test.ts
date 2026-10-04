import { describe, expect, it } from 'vitest';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { mosaicOf, OBJECT_TYPES, objectTypeById } from '../../catalog/domain/objectTypes';
import { layoutResort, place } from '../../layout/domain/resortLayout';
import { RESORT_PLAN } from '../../layout/domain/resortPlan';
import { shoreFor } from '../../layout/domain/shoreline';
import { gridInterior } from '../../lighting/domain/lightGrid';
import {
  claimingOn,
  everythingOn,
  prepareResort,
  preparedTransferables,
  rentalOf,
  styleOfFor,
  type PrepRequest,
  type PreparedResort,
} from './prepareResort';

const PARAMS = { tilesX: 48, tilesZ: 48, density: 0.6, seed: 5 };

// Shared because the bake is not free.
const generated: PreparedResort = prepareResort({
  source: { kind: 'generate', params: PARAMS },
  repeat: 1,
  view: null,
});

describe('prepareResort', () => {
  it('grows the plan it was asked for and lays it out', () => {
    expect(generated.plan).toMatchObject({ tilesX: 48, tilesZ: 48 });
    expect(generated.plot.placements.length).toBeGreaterThan(0);
    expect(generated.plot.paths).toBe(generated.plot.paths);
    expect(everythingOn(generated.plot)).toHaveLength(
      claimingOn(generated.plot).length + generated.plot.rails.length,
    );
  });

  it('bakes the lamps and the sky visibility into one volume', () => {
    const lighting = generated.lighting!;
    expect(lighting.grid.litCells).toBeGreaterThan(0);
    const { direction, spec } = lighting.grid;
    const interior = gridInterior(spec);
    let shaded = false;
    for (let iz = interior.lowZ; iz <= interior.highZ && !shaded; iz++) {
      for (let ix = interior.lowX; ix <= interior.highX && !shaded; ix++) {
        const cell = ix + spec.dims.x * (1 + spec.dims.y * iz);
        if (direction[cell * 4 + 3]! < 255) shaded = true;
      }
    }
    expect(shaded).toBe(true);
    expect(generated.anchors.length).toBeGreaterThan(0);
  });

  it('meshes the terrain around where the camera is framed', () => {
    expect(generated.surfaces.sea).not.toBeNull();
    expect(generated.framing.target.x).toBeGreaterThan(0);
  });

  it('clears to bare ground with nothing standing on it', () => {
    const bare = prepareResort({
      source: { kind: 'clear', params: PARAMS },
      repeat: 1,
      view: null,
    });
    expect(bare.plot.placements).toHaveLength(0);
    expect(bare.bounds).toMatchObject({ minX: 0, maxX: 48 * 16, height: 0 });
  });

  it('lights and frames a bare world over the land it starts owning, not the whole world', () => {
    const world = prepareResort({
      source: { kind: 'clear', params: { ...PARAMS, tilesX: 256, tilesZ: 256 } },
      repeat: 1,
      view: null,
    });
    const owned = { minX: 96 * 16, maxX: 160 * 16, minZ: 176 * 16, maxZ: 256 * 16 };
    expect(world.bounds).toMatchObject(owned);
    const { origin, cellSize, dims } = world.lighting!.grid.spec;
    expect(origin.x).toBeGreaterThan(owned.minX - 200);
    expect(origin.x + cellSize * dims.x).toBeLessThan(owned.maxX + 200);
    expect(origin.z).toBeGreaterThan(owned.minZ - 200);
    expect(world.moorings.length).toBeGreaterThan(0);
    for (const mooring of world.moorings) {
      expect(mooring.x).toBeGreaterThan(owned.minX);
      expect(mooring.x).toBeLessThan(owned.maxX);
    }
  });

  it('frames a bare world over all the land it owns, however little stands on it', () => {
    const asked = { ...PARAMS, tilesX: 256, tilesZ: 256 };
    const plan = prepareResort({ source: { kind: 'clear', params: asked }, repeat: 1, view: null });
    const hut = place(layoutItemFor(objectTypeById('bungalow')), 'bungalow#0', 128, 190, 0, 1);
    const world = {
      tilesX: 256,
      tilesZ: 256,
      shore: plan.plan.shore ?? null,
      elevation: plan.plan.elevation ?? null,
      terrain: [],
      placements: [hut],
      props: [],
      paths: [],
      rails: [],
      land: plan.plan.land!,
    };
    const one = prepareResort({ source: { kind: 'saved', world }, repeat: 1, view: null });
    expect(one.bounds).toMatchObject({ minX: 96 * 16, maxX: 160 * 16, minZ: 176 * 16 });
  });

  it('lights and frames a plot without land over its whole plot, as before land was sold', () => {
    const { origin, cellSize, dims } = generated.lighting!.grid.spec;
    expect(origin.x).toBeLessThanOrEqual(0);
    expect(origin.x + cellSize * dims.x).toBeGreaterThanOrEqual(48 * 16);
    expect(generated.plan).not.toHaveProperty('land');
  });

  it('tiles the authored plan for a benchmark, and frames its preset', () => {
    const tiled = prepareResort({ source: { kind: 'authored' }, repeat: 2, view: 'street' });
    expect(tiled.plan).toBe(RESORT_PLAN);
    expect(tiled.plot.placements).toHaveLength(tiled.plot.layout.placements.length * 4);
    expect(tiled.framing.position.y).toBeLessThan(20);
  });
});

const request = (source: PrepRequest['source']): PrepRequest => ({
  source,
  repeat: 1,
  view: null,
});

describe('styleOfFor', () => {
  it('styles the authored plot only when a benchmark asks, by cell or scattered', () => {
    const minorityIn = (styles?: 'mixed' | 'scatter'): number => {
      const asked = { ...request({ kind: 'authored' }), ...(styles ? { styles } : {}) };
      const styleOf = styleOfFor(asked, RESORT_PLAN);
      let variants = 0;
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) if (styleOf('hedge', x, z) !== 'hedge') variants++;
      }
      return Math.min(variants, 256 - variants) / 256;
    };
    expect(minorityIn()).toBe(0);
    expect(minorityIn('mixed')).toBeLessThan(0.15);
    expect(minorityIn('scatter')).toBeGreaterThan(0.3);
  });

  const styledAcross = (source: PrepRequest['source']): Set<string> => {
    const styleOf = styleOfFor(request(source), generated.plan);
    const ids = new Set<string>();
    for (let x = 0; x < 48; x++) {
      for (let z = 0; z < 48; z++) ids.add(styleOf('bakery', x, z));
    }
    return ids;
  };

  it('mixes the styles of a generated plot', () => {
    expect(styledAcross({ kind: 'generate', params: PARAMS })).toEqual(
      new Set(['bakery', 'bakery-b']),
    );
  });

  it('keeps the originals on a classic plot, the authored one and a cleared one', () => {
    const classic = { ...PARAMS, config: { variety: 'classic' as const } };
    expect(styledAcross({ kind: 'generate', params: classic })).toEqual(new Set(['bakery']));
    expect(styledAcross({ kind: 'authored' })).toEqual(new Set(['bakery']));
    expect(styledAcross({ kind: 'clear', params: PARAMS })).toEqual(new Set(['bakery']));
  });

  it('stands variants on a generated plot', () => {
    const ids = new Set(generated.plot.placements.map((placement) => placement.id));
    expect([...ids].some((id) => id.endsWith('-b'))).toBe(true);
  });
});

const tiles = (paths: readonly { readonly tileX: number; readonly tileZ: number }[]) =>
  paths.map((path) => `${path.tileX},${path.tileZ}`);
const laidInMosaic = (prepared: PreparedResort) =>
  prepared.plot.paths.filter((path) => mosaicOf(path.id) !== null);

describe('mosaic on a generated plot', () => {
  // Against the same styles laid plain, not a classic plot: a variant's door may sit elsewhere.
  it('dresses some of the paving in mosaic and paves the same tiles as the plot laid plain', () => {
    const classic = prepareResort({
      source: { kind: 'generate', params: { ...PARAMS, config: { variety: 'classic' } } },
      repeat: 1,
      view: null,
    });
    expect(laidInMosaic(generated).length).toBeGreaterThan(0);
    expect(laidInMosaic(classic)).toEqual([]);
    const plain = layoutResort(
      OBJECT_TYPES.map(layoutItemFor),
      generated.plan,
      styleOfFor(request({ kind: 'generate', params: PARAMS }), generated.plan),
    );
    expect(tiles(generated.plot.paths)).toEqual(tiles(plain.paths));
    expect(generated.plot.layout.paths).toEqual(generated.plot.paths);
  });

  it('leaves the authored plot plain unless a benchmark asks', () => {
    const authored = prepareResort({ source: { kind: 'authored' }, repeat: 1, view: null });
    expect(laidInMosaic(authored)).toEqual([]);
  });
});

describe('rentalOf', () => {
  it('finds the pedalos a rental in another style', () => {
    const hut = place(layoutItemFor(objectTypeById('pedalo-rental-b')), 'hut', 4, 6);
    const shore = shoreFor(generated.plan);
    expect(shore).not.toBeNull();
    expect(rentalOf(shore, [hut])).not.toBeNull();
  });
});

describe('crossing to the main thread', () => {
  it('survives a structured clone, which is how a worker hands it over', () => {
    // A function, class instance or symbol would throw here rather than in the browser, where the only
    // symptom is a resort that never arrives.
    const cloned = structuredClone(generated);
    expect(cloned.plot.placements).toEqual(generated.plot.placements);
    expect(cloned.plan).toEqual(generated.plan);
  });
});

describe('preparedTransferables', () => {
  it('names every buffer once, the baked volume and the terrain included', () => {
    const buffers = preparedTransferables(generated);
    expect(new Set(buffers).size).toBe(buffers.length);
    expect(buffers).toContain(generated.lighting!.grid.irradiance.buffer);
    expect(buffers).toContain(generated.surfaces.sea!.positions.buffer);
  });
});
