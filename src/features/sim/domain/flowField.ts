/**
 * One sweep of the walk graph, as an answer to "which way from here".
 *
 * A flow field is the whole of the routing: a multi-source breadth-first search
 * outward from a venue's doors, writing into every node the neighbour that gets
 * nearer to them. A guest arriving anywhere then costs one array read, whatever
 * the plot looks like and however many guests there are - which is why this
 * genre has always routed crowds this way rather than running a search per
 * person.
 *
 * ## By hops, not by metres
 *
 * The sweep counts hops and ignores {@link WalkEdge.length}. The graph is a
 * near-uniform lattice of tile centres, so hops and metres agree to within the
 * rise of a stair; a plain queue is O(V + E) with two integer indices, where
 * weighting by length would need a heap and a lot more per node for an answer
 * that picks the same path. `plans/README.md`'s decision 2 records this.
 *
 * ## Nothing allocates after the two arrays
 *
 * The queue is a preallocated `Int32Array` of the graph's own size with a head
 * and a tail, and `hops` initialised to -1 doubles as the visited mark. A field
 * is built on the first guest who walks to a venue, and that guest is in the
 * middle of a frame.
 */

import type { WalkNetwork } from '../../crowd/domain/walkNetwork';

export interface FlowField {
  /**
   * Per node, the node to step to next to get nearer a source, or -1 where the
   * source cannot be reached from here. A source's own entry is itself, which is
   * how a caller knows somebody has arrived.
   */
  readonly next: Int32Array;
  /** Hops from each node to the nearest source, or -1 where unreachable. */
  readonly hops: Int32Array;
}

/**
 * One multi-source breadth-first sweep of the graph, as a next-node array.
 *
 * Sources are seeded in the order given, so a node equally far from two of them
 * routes to whichever was named first: the caller sorts its doors and the answer
 * is then the same on two runs of the same plot. A duplicate or out-of-range
 * source is skipped rather than thrown at, because a door list is derived from a
 * graph that may have just been rebuilt.
 *
 * Empty sources give a field of -1 throughout. That is a venue with no door, and
 * every caller has to handle it anyway.
 */
export function flowFieldFor(network: WalkNetwork, sources: readonly number[]): FlowField {
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
      // Walking the sweep *outward* along an edge and pointing the node it
      // reaches back the way we came: an edge is stored in both directions, so
      // the neighbour's own way in is this node.
      const to = network.edges[edge]!.to;
      if (hops[to] !== -1) continue;
      hops[to] = step;
      next[to] = at;
      queue[tail++] = to;
    }
  }

  return { next, hops };
}
