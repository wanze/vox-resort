/**
 * The crowd against a resort the generator actually produced.
 *
 * Everything else in this feature is tested on fixtures of four or five tiles,
 * which is the right size to say what a rule *is*. This says the rules survive
 * contact with 1 870 paved tiles laid by something that has never heard of them
 * — a coast that wanders, a hill with flights up it, and a beach at the bottom.
 */

import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { elevationFor, levelAt } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { createCrowd, stepCrowd } from './crowd';
import { walkNetworkFor, type WalkNetwork } from './walkNetwork';

const TYPES = OBJECT_TYPES.map((type) => ({
  id: type.id,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  category: type.category,
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

describe('the network of a generated resort', () => {
  it('has a node for every paved tile', () => {
    expect(network.nodes).toHaveLength(layout.paths.length);
    expect(network.nodes.length).toBeGreaterThan(1000);
  });

  it('is one piece, so nobody is stranded on a spur of their own', () => {
    // The layout already guarantees the paving is connected. What this checks is
    // that the *walk* is: a stair rule that refused a flight it should have
    // allowed would cut the hill off, and every path on it with it.
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

describe('a crowd on a generated resort', () => {
  it('keeps everybody on the plot and out of the sea', () => {
    // Counted rather than asserted per person per frame: a million expectations
    // is a minute of test runner and one line of signal.
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
        else if (terrainAt(shore, tileX, tileZ) === 'water') wrong.inTheSea++;
      }
    }
    expect(wrong).toEqual({ nowhere: 0, offPlot: 0, inTheSea: 0 });
  });

  it('puts people on the beach at once, and keeps them there', () => {
    // Left to fill by random walk the sand held one person after ten seconds and
    // forty after twenty minutes, on a plot with 28 gates among 1 870 nodes — a
    // beach nobody is on for the first ten minutes of looking at the resort. So
    // a share of the crowd starts on it, and the rates hold them there.
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
