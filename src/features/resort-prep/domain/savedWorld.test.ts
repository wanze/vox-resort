import { describe, expect, it } from 'vitest';
import { createTileOccupancy } from '../../build/domain/tileOccupancy';
import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { seatSpotsFor } from '../../crowd/domain/seating';
import { walkNetworkFor } from '../../crowd/domain/walkNetwork';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor, type Terrain } from '../../layout/domain/terrain';
import { claimingOn, prepareResort, type Plot } from './prepareResort';
import { planOfWorld, savedWorldOf, savedWorldSchema } from './savedWorld';

const PARAMS = { tilesX: 48, tilesZ: 48, density: 0.6, seed: 5 };

const networkOn = (plan: ResortPlan, terrain: Terrain, plot: Plot) =>
  walkNetworkFor({
    paved: plot.paths,
    levelOf: (tileX, tileZ) => terrain.levelOf(tileX, tileZ),
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
    seats: seatSpotsFor([...plot.placements, ...plot.props].map(seatSiteOf)),
    obstacles: [...plot.placements, ...plot.props],
  });

// A generated plot, then played on: a tile dug and a path laid by hand.
function played() {
  const prepared = prepareResort({
    source: { kind: 'generate', params: PARAMS },
    repeat: 1,
    view: null,
  });
  const terrain = terrainFor(prepared.plan);
  const dug = { tileX: 2, tileZ: 3 };
  terrain.set(dug.tileX, dug.tileZ, {
    level: terrain.levelOf(dug.tileX, dug.tileZ) + 1,
    surface: 'grass',
  });
  const taken = createTileOccupancy(claimingOn(prepared.plot));
  const free = (x: number, z: number) =>
    taken.keyAt({ x, z }) === undefined && terrain.surfaceOf(x, z) !== 'water';
  const path = prepared.plot.paths.find((each) => free(each.tileX + 1, each.tileZ))!;
  prepared.plot.paths.push({
    ...path,
    key: `${path.id}@${path.tileX + 1},${path.tileZ}`,
    tileX: path.tileX + 1,
    x: path.x + TILE_VOXELS,
  });
  return { prepared, terrain };
}

describe('a saved world', () => {
  it('prepares the plan, terrain, lists and walk network it was saved from', () => {
    const { prepared, terrain } = played();
    const world = savedWorldOf(prepared.plan, terrain, prepared.plot);
    const loaded = prepareResort({ source: { kind: 'saved', world }, repeat: 1, view: null });

    expect(loaded.plan).toMatchObject({ tilesX: PARAMS.tilesX, tilesZ: PARAMS.tilesZ });
    const again = terrainFor(loaded.plan);
    for (let tileZ = 0; tileZ < PARAMS.tilesZ; tileZ++) {
      for (let tileX = 0; tileX < PARAMS.tilesX; tileX++) {
        expect(again.tileAt(tileX, tileZ)).toEqual(terrain.tileAt(tileX, tileZ));
      }
    }
    for (const list of ['placements', 'props', 'paths', 'rails'] as const) {
      expect(loaded.plot[list], list).toEqual(prepared.plot[list]);
      expect(loaded.plot.layout[list], list).toEqual(prepared.plot[list]);
    }

    const before = networkOn(prepared.plan, terrain, prepared.plot);
    const after = networkOn(loaded.plan, again, loaded.plot);
    expect(after.nodes.length).toBe(before.nodes.length);
    expect(after.nodes.map(({ x, y, z }) => [x, y, z])).toEqual(
      before.nodes.map(({ x, y, z }) => [x, y, z]),
    );
    expect(after.seats).toEqual(before.seats);
  });

  it('gives the plot lists of its own, for the edit mode to push and splice', () => {
    const { prepared, terrain } = played();
    const world = savedWorldOf(prepared.plan, terrain, prepared.plot);
    const { plot } = prepareResort({ source: { kind: 'saved', world }, repeat: 1, view: null });
    plot.paths.pop();
    expect(plot.layout.paths).toHaveLength(plot.paths.length + 1);
  });

  it('parses as saved, and refuses an object the catalogue no longer has', () => {
    const { prepared, terrain } = played();
    const world = savedWorldOf(prepared.plan, terrain, prepared.plot);
    expect(savedWorldSchema.safeParse(world).success).toBe(true);
    const gone = { ...world.props[0]!, id: 'retired-statue' };
    expect(savedWorldSchema.safeParse({ ...world, props: [gone] }).success).toBe(false);
    expect(
      savedWorldSchema.safeParse({ ...world, paths: [{ ...world.paths[0]!, rotation: 5 }] })
        .success,
    ).toBe(false);
  });

  it('keeps a plan with no shore or hill without either', () => {
    const plan = planOfWorld({
      tilesX: 4,
      tilesZ: 4,
      shore: null,
      elevation: null,
      terrain: [],
      placements: [],
      props: [],
      paths: [],
      rails: [],
    });
    expect(plan).not.toHaveProperty('shore');
    expect(plan).not.toHaveProperty('elevation');
  });
});
