/**
 * Where on a graph a person standing at a point should be put.
 *
 * Its own module rather than a function in `crowd.ts` because it is a question
 * about the network and not about the crowd: given a point and a graph, which
 * node is nearest. That makes it testable against a few hand-built nodes instead
 * of against a crowd, and it is the one piece of `reseatCrowd` with a failure
 * mode worth pinning down — a person snapped to the wrong side of the plot walks
 * visibly across it.
 *
 * ## A ring search, then one scan
 *
 * Nodes are indexed by the tile they stand on, and the search walks outward ring
 * by ring from the person's own tile. On a plot where paving is everywhere that
 * is a lookup or two; on a person standing in the middle of a lawn it is a
 * handful. Beyond {@link MAX_SNAP_TILES} it gives up and scans the node list
 * once, which is the case where the paving under somebody was demolished
 * wholesale and the honest answer is a long walk.
 *
 * Squared distances throughout: the nearest node by distance is the nearest by
 * distance squared, and this runs once per person per edit.
 *
 * ## Only nodes somebody can walk away from
 *
 * A paved tile with no paved neighbour is a node with no exits, and a person put
 * on one would stand on it for ever: arriving at a node picks an exit, and there
 * is none. So such nodes are left out of the index, and out of the scan, and the
 * nearest node here means the nearest one that is part of a walk.
 */
import type { WalkNetwork } from './walkNetwork';

/**
 * How far the ring search looks before it falls back to scanning.
 *
 * Twenty-four tiles is nearly a hundred metres, which is further than anybody
 * would be from paving on a plot with any on it. The number is a ceiling on the
 * search rather than on the answer: past it the scan finds the true nearest node
 * however far away it is.
 */
export const MAX_SNAP_TILES = 24;

/** Nodes of a network indexed by the tile they stand on. */
export interface NodeIndex {
  /** Node indices standing on a tile, or undefined where none do. */
  at(tileX: number, tileZ: number): readonly number[] | undefined;
}

/** Builds the index once, for a whole reseat. */
export function nodeIndexFor(network: WalkNetwork): NodeIndex {
  const byTile = new Map<string, number[]>();
  for (const [index, node] of network.nodes.entries()) {
    if (node.exits.length === 0) continue;
    const key = `${node.tileX},${node.tileZ}`;
    const list = byTile.get(key);
    if (list) list.push(index);
    else byTile.set(key, [index]);
  }
  return { at: (tileX, tileZ) => byTile.get(`${tileX},${tileZ}`) };
}

/**
 * The node nearest a point, or -1 on a network with no node anybody can walk
 * away from.
 *
 * `tileVoxels` is how many voxels a tile is across, so the point can be turned
 * into the tile the search starts from; pass `TILE_VOXELS`.
 */
export function nearestNodeTo(
  network: WalkNetwork,
  index: NodeIndex,
  x: number,
  z: number,
  tileVoxels: number,
): number {
  const tileX = Math.floor(x / tileVoxels);
  const tileZ = Math.floor(z / tileVoxels);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  const consider = (candidate: number): void => {
    const node = network.nodes[candidate]!;
    const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
    // Ties go to the lower index, so the answer does not depend on the order the
    // rings happen to visit tiles in.
    if (distance < bestDistance || (distance === bestDistance && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  };
  const considerTile = (tx: number, tz: number): void => {
    for (const candidate of index.at(tx, tz) ?? []) consider(candidate);
  };

  for (let ring = 0; ring <= MAX_SNAP_TILES; ring++) {
    // A ring being non-empty does not make its nearest node the answer. A node
    // stands inside its own tile, so one in ring `ring` is at least `ring - 1`
    // whole tiles from any point of the person's tile — but a node found at the
    // far corner of an earlier ring can be further than that: at ring 2 the
    // corner is up to 2.5 × √2 tiles off, and a node straight across in ring 4
    // can be 3.5. Stopping at the first non-empty ring, or one past it, would
    // snap somebody to the corner. So the search goes on until no node of the
    // next ring could possibly be closer than the best already found.
    const nearestPossible = Math.max(0, ring - 1) * tileVoxels;
    if (best !== -1 && nearestPossible * nearestPossible >= bestDistance) return best;
    if (ring === 0) {
      considerTile(tileX, tileZ);
      continue;
    }
    // The square's border only: everything inside it was an earlier ring.
    for (let d = -ring; d <= ring; d++) {
      considerTile(tileX + d, tileZ - ring);
      considerTile(tileX + d, tileZ + ring);
    }
    for (let d = -ring + 1; d <= ring - 1; d++) {
      considerTile(tileX - ring, tileZ + d);
      considerTile(tileX + ring, tileZ + d);
    }
  }

  // Out of rings without proving the answer, whether or not one was found: a
  // node past the last ring may still be nearer than anything inside it.
  for (const [candidate, node] of network.nodes.entries()) {
    if (node.exits.length > 0) consider(candidate);
  }
  return best;
}
