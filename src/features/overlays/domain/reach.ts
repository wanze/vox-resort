import type { NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { doorsFor } from '../../sim/domain/doors';
import { SAND_ROUTE_TILES } from '../../sim/domain/router';
import { sandRoutesFor } from '../../sim/domain/sandRoute';
import { reliefAt, type Venue } from '../../sim/domain/venues';
import { TILE_VOXELS, type GuestNeed } from '../../../../voxel-gen/voxelgen.ts';

export interface ReachSeed {
  readonly node: number;
  readonly hops: number;
}

// A building on the sand has no door on the graph, so it is seeded where the router walks a
// guest off it: at each gate of a sand route, already that route's tiles away. Routes use the
// router's own reach, so a building it cannot reach does not read as near here either.
export function reachSeedsFor(
  venues: readonly Venue[],
  need: GuestNeed,
  network: WalkNetwork,
  index: NodeIndex,
): ReachSeed[] {
  const seeds: ReachSeed[] = [];
  for (const venue of venues) {
    if (reliefAt(venue, need) <= 0) continue;
    const doors = doorsFor(venue, index, network);
    for (const node of doors.nodes) seeds.push({ node, hops: 0 });
    if (doors.nodes.length > 0) continue;
    for (const route of sandRoutesFor(network, doors.sand, SAND_ROUTE_TILES)) {
      seeds.push({ node: route.gate, hops: Math.round(route.length / TILE_VOXELS) });
    }
  }
  return seeds;
}

// flowFieldFor's sweep, but a seed may start further out than 0. Seeds join the queue once
// the frontier reaches their distance, which keeps it in order without a heap.
export function hopsFrom(network: WalkNetwork, seeds: readonly ReachSeed[]): Int32Array {
  const count = network.nodes.length;
  const hops = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  const ordered = seeds
    .filter((seed) => seed.node >= 0 && seed.node < count)
    .toSorted((a, b) => a.hops - b.hops);
  let head = 0;
  let tail = 0;
  let next = 0;

  while (head < tail || next < ordered.length) {
    const seed = ordered[next];
    if (seed && (head === tail || seed.hops <= hops[queue[head]!]!)) {
      next++;
      if (hops[seed.node] !== -1) continue;
      hops[seed.node] = seed.hops;
      queue[tail++] = seed.node;
      continue;
    }
    const at = queue[head++]!;
    for (const edge of network.nodes[at]!.exits) {
      const to = network.edges[edge]!.to;
      if (hops[to] !== -1) continue;
      hops[to] = hops[at]! + 1;
      queue[tail++] = to;
    }
  }
  return hops;
}
