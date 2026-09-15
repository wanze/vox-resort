/**
 * The crowd against a resort the generator actually produced.
 *
 * Everything else in this feature is tested on fixtures of four or five tiles,
 * which is the right size to say what a rule *is*. This says the rules survive
 * contact with 1 870 paved tiles laid by something that has never heard of them
 * — a coast that wanders, a hill with flights up it, and a beach at the bottom.
 */

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
    // A flight is the one tile that holds two, at the foot and the head of the
    // climb — except where two flights meet and share the landing between them.
    expect(stairs.length).toBeGreaterThan(0);
    expect(network.nodes.length).toBeGreaterThan(layout.paths.length);
    expect(network.nodes.length).toBeLessThanOrEqual(layout.paths.length + stairs.length);
    expect(network.nodes.length).toBeGreaterThan(1000);
  });

  it('never stands a node under the treads of the flight it is on', () => {
    // The bug this is here for: a flight's ramp climbs the width of its own
    // tile, so a node at the tile centre carrying the ground's own height sits
    // half a level below the staircase, and the crowd wades through it.
    const paved = new Map(layout.paths.map((path) => [`${path.tileX},${path.tileZ}`, path]));
    for (const stair of stairs) {
      const tile = paved.get(`${stair.tile.x},${stair.tile.z}`)!;
      const on = network.nodes.filter(
        (node) => node.tileX === stair.tile.x && node.tileZ === stair.tile.z,
      );
      for (const node of on) {
        const acrossX = Math.abs(node.x - (stair.tile.x + 0.5) * TILE_VOXELS);
        const acrossZ = Math.abs(node.z - (stair.tile.z + 0.5) * TILE_VOXELS);
        // Every one of them is on an edge of the tile, never in the middle of
        // the ramp, and at whichever paving that edge meets.
        expect(Math.max(acrossX, acrossZ), `${stair.tile.x},${stair.tile.z}`).toBe(TILE_VOXELS / 2);
        expect([walkingSurface(tile.y), walkingSurface(tile.y) + LEVEL_VOXELS]).toContain(node.y);
      }
    }
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

/** The tiles the plot paves, which out on the water are the two piers. */
const paved = new Set(layout.paths.map((path) => `${path.tileX},${path.tileZ}`));

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
        // Over water is only wrong where there is no pier under them: the two
        // sea lanes carry on past the tideline as jetties, and walking to the
        // end of one is the point of building it. See `jetty.ts`.
        else if (terrainAt(shore, tileX, tileZ) === 'water' && !paved.has(`${tileX},${tileZ}`)) {
          wrong.inTheSea++;
        }
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

describe('the cost of walking faster than real time', () => {
  /**
   * The ceiling on plan 026's trade, in the shape of `flowField.test.ts`'s: a
   * crowd walking at the simulation's pace runs {@link MAX_SUBSTEPS} steps a
   * frame at most, and the frame has to be able to afford them.
   *
   * What it holds the cap to is that it costs **no more than its own factor**
   * over a frame at real time, plus 15% for the loop around the steps: anything
   * worse is avoidance being run more often than once a step, or something in the
   * loop allocating. A ratio rather than a number of milliseconds, so a slower
   * machine slows both halves and does not turn this red.
   *
   * **Timed in this process's own CPU time, not on the wall clock.** The suite
   * runs files side by side, and wall-clock time counts every moment a worker
   * spent waiting its turn: measured that way the ratio came out anywhere from
   * 1.01 alone to 1.23 under the rest of the suite, which is the machine's load
   * and not the loop's.
   *
   * Per frame, each way: a simulated minute of the crowd's own time at real
   * time - six hundred frames of `MAX_STEP` - and the frames at the cap that
   * cover the same, after a warm-up of both so neither half pays for the other's
   * compile, and the quicker of seven runs of each so one collection pause does
   * not decide it.
   */
  it('costs no more than its factor over a frame at real time', () => {
    const seconds = 60;
    /** CPU microseconds a frame costs, at `scale` times real time. */
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
    // Taken turn about rather than one half after the other, so a stretch of
    // load from the rest of the suite lands on both halves and not on one.
    let atOne = Infinity;
    let atCap = Infinity;
    for (let run = 0; run < 7; run++) {
      atOne = Math.min(atOne, perFrame(1));
      atCap = Math.min(atCap, perFrame(MAX_SUBSTEPS));
    }
    expect(atCap).toBeLessThan(MAX_SUBSTEPS * atOne * 1.15);
  });
});
