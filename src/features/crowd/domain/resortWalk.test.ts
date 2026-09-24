import { describe, expect, it } from 'vitest';
import { LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { elevationFor, levelAt } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { stairTilesFor } from '../../layout/domain/stairs';
import { createCrowd, MAX_STEP, MAX_SUBSTEPS, stepCrowd } from './crowd';
import { walkingSurface, walkNetworkFor, type WalkNetwork } from './walkNetwork';

const TYPES = OBJECT_TYPES.map((type) => ({
  id: type.id,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  category: type.category,
  placement: type.model.placement,
}));

const ITEMS: LayoutItem[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  width: type.model.width,
  depth: type.model.depth,
  category: type.category,
}));

const plan = generateResort(
  TYPES,
  clampParams({ tilesX: 112, tilesZ: 100, seed: 3, density: 0.7 }),
);
const layout = layoutResort(ITEMS, plan);
const shore = shoreFor(plan);
const elevation = elevationFor(plan);
const network: WalkNetwork = walkNetworkFor({
  paved: layout.paths,
  levelOf: (x, z) => levelAt(elevation, x, z),
  shore,
  tilesX: plan.tilesX,
});

const stairs = stairTilesFor(
  layout.paths.map((path) => ({ x: path.tileX, z: path.tileZ })),
  (x, z) => levelAt(elevation, x, z),
);

describe('the network of a generated resort', () => {
  it('has a node for every paved tile, and a second at the top of every flight', () => {
    expect(stairs.length).toBeGreaterThan(0);
    expect(network.nodes.length).toBeGreaterThan(layout.paths.length);
    expect(network.nodes.length).toBeLessThanOrEqual(layout.paths.length + stairs.length);
    expect(network.nodes.length).toBeGreaterThan(1000);
  });

  it('never stands a node under the treads of the flight it is on', () => {
    const paved = new Map(layout.paths.map((path) => [`${path.tileX},${path.tileZ}`, path]));
    for (const stair of stairs) {
      const tile = paved.get(`${stair.tile.x},${stair.tile.z}`)!;
      const on = network.nodes.filter(
        (node) => node.tileX === stair.tile.x && node.tileZ === stair.tile.z,
      );
      for (const node of on) {
        const acrossX = Math.abs(node.x - (stair.tile.x + 0.5) * TILE_VOXELS);
        const acrossZ = Math.abs(node.z - (stair.tile.z + 0.5) * TILE_VOXELS);
        expect(Math.max(acrossX, acrossZ), `${stair.tile.x},${stair.tile.z}`).toBe(TILE_VOXELS / 2);
        expect([walkingSurface(tile.y), walkingSurface(tile.y) + LEVEL_VOXELS]).toContain(node.y);
      }
    }
  });

  it('is one piece, so nobody is stranded on a spur of their own', () => {
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      const at = queue.pop()!;
      for (const exit of network.nodes[at]!.exits) {
        const to = network.edges[exit]!.to;
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    expect(seen.size).toBe(network.nodes.length);
  });

  it('finds its way onto the beach', () => {
    expect(network.gates.length).toBeGreaterThan(0);
    expect(network.beach).not.toBeNull();
  });
});

const paved = new Set(layout.paths.map((path) => `${path.tileX},${path.tileZ}`));

describe('a crowd on a generated resort', () => {
  it('keeps everybody on the plot and out of the sea', () => {
    // Counted rather than asserted per person per frame: a million expectations take a minute.
    const crowd = createCrowd({ network, count: 600, variants: 4, seed: 1 });
    const wrong = { nowhere: 0, offPlot: 0, inTheSea: 0 };
    for (let frame = 0; frame < 1800; frame++) {
      stepCrowd(crowd, 1 / 60);
      for (let i = 0; i < crowd.count; i++) {
        if (!Number.isFinite(crowd.x[i]!) || !Number.isFinite(crowd.y[i]!)) {
          wrong.nowhere++;
          continue;
        }
        const tileX = Math.floor(crowd.x[i]! / TILE_VOXELS);
        const tileZ = Math.floor(crowd.z[i]! / TILE_VOXELS);
        if (tileX < 0 || tileX >= plan.tilesX || tileZ < 0) wrong.offPlot++;
        else if (terrainAt(shore, tileX, tileZ) === 'water' && !paved.has(`${tileX},${tileZ}`)) {
          wrong.inTheSea++;
        }
      }
    }
    expect(wrong).toEqual({ nowhere: 0, offPlot: 0, inTheSea: 0 });
  });

  it('puts people on the beach at once, and keeps them there', () => {
    const crowd = createCrowd({ network, count: 600, variants: 4, seed: 1 });
    const roaming = (): number => {
      let count = 0;
      for (let i = 0; i < crowd.count; i++) if (crowd.node[i] === -1) count++;
      return count;
    };
    expect(roaming()).toBeGreaterThan(100);
    for (let frame = 0; frame < 60 * 60 * 5; frame++) stepCrowd(crowd, 1 / 60);
    expect(roaming(), 'the beach drained').toBeGreaterThan(100);
  });
});

describe('the cost of walking faster than real time', () => {
  // CPU time rather than wall clock, since parallel test files skew wall time. A ratio,
  // so a slower machine slows both halves alike.
  it('costs no more than its factor over a frame at real time', () => {
    const seconds = 60;
    const perFrame = (scale: number): number => {
      const crowd = createCrowd({ network, count: 600, variants: 4, seed: 7 });
      const frames = Math.round(seconds / (MAX_STEP * scale));
      const started = process.cpuUsage();
      for (let frame = 0; frame < frames; frame++) stepCrowd(crowd, MAX_STEP * scale);
      const spent = process.cpuUsage(started);
      return (spent.user + spent.system) / frames;
    };
    perFrame(1);
    perFrame(MAX_SUBSTEPS);
    // Interleaved so load from the rest of the suite lands on both halves.
    let atOne = Infinity;
    let atCap = Infinity;
    for (let run = 0; run < 7; run++) {
      atOne = Math.min(atOne, perFrame(1));
      atCap = Math.min(atCap, perFrame(MAX_SUBSTEPS));
    }
    expect(atCap).toBeLessThan(MAX_SUBSTEPS * atOne * 1.15);
  });
});
