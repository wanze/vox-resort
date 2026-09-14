import { describe, expect, it } from 'vitest';
import { RESORT_PLAN } from '../../layout/domain/resortPlan';
import { gridInterior } from '../../lighting/domain/lightGrid';
import {
  claimingOn,
  everythingOn,
  prepareResort,
  preparedTransferables,
  type PreparedResort,
} from './prepareResort';

const PARAMS = { tilesX: 48, tilesZ: 48, density: 0.6, seed: 5 };

/** Grown once and shared: a pure function of its request, and the bake is not free. */
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
    // Something on the plot takes sky away, so some interior cell is below open.
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
    // A generated plot always has a coast, so there is a sea to mesh.
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

  it('tiles the authored plan for a benchmark, and frames its preset', () => {
    const tiled = prepareResort({ source: { kind: 'authored' }, repeat: 2, view: 'street' });
    expect(tiled.plan).toBe(RESORT_PLAN);
    expect(tiled.plot.placements).toHaveLength(tiled.plot.layout.placements.length * 4);
    // The street preset stands at lamp height, not above the plot.
    expect(tiled.framing.position.y).toBeLessThan(20);
  });
});

describe('crossing to the main thread', () => {
  it('survives a structured clone, which is how a worker hands it over', () => {
    // A function, a class instance or a symbol anywhere in it would throw here
    // rather than in the browser, where the only symptom is a resort that never
    // arrives.
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
