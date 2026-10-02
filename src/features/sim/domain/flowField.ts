// Counts hops, not edge length: on a near-uniform tile lattice both pick the same path,
// and a plain queue needs no heap. Nothing allocates past the two arrays because a
// field is built mid-frame, on the first guest walking to a venue.

import type { WalkNetwork } from '../../crowd/domain/walkNetwork';

export interface FlowField {
  // A source points at itself, which is how a caller knows somebody has arrived.
  readonly next: Int32Array;
  readonly hops: Int32Array;
}

export interface FlowOptions {
  // Never up or down a flight's treads, for a party with a wheelchair.
  readonly stepFree?: boolean;
}

// Sources are seeded in order so ties are deterministic. Invalid sources are skipped,
// not thrown at, because a door list may outlive a just-rebuilt graph.
export function flowFieldFor(
  network: WalkNetwork,
  sources: readonly number[],
  options: FlowOptions = {},
): FlowField {
  const stepFree = options.stepFree === true;
  const count = network.nodes.length;
  const next = new Int32Array(count).fill(-1);
  const hops = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  let tail = 0;

  for (const source of sources) {
    if (source < 0 || source >= count || hops[source] !== -1) continue;
    next[source] = source;
    hops[source] = 0;
    queue[tail++] = source;
  }

  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    const step = hops[at]! + 1;
    for (const edge of network.nodes[at]!.exits) {
      // Edges are stored both ways, so the node we came from is the neighbour's way in.
      const { to, stepped } = network.edges[edge]!;
      if (hops[to] !== -1 || (stepFree && stepped)) continue;
      hops[to] = step;
      next[to] = at;
      queue[tail++] = to;
    }
  }

  return { next, hops };
}
