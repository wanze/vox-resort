// Nodes with no exits are left out: a person put on one would stand on it for ever.
import type { WalkNetwork } from './walkNetwork';

// A ceiling on the search, not on the answer: past it the scan still finds the true nearest node.
export const MAX_SNAP_TILES = 24;

export interface NodeIndex {
  at(tileX: number, tileZ: number): readonly number[] | undefined;
}

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
    // Ties go to the lower index, so the answer does not depend on ring visiting order.
    if (distance < bestDistance || (distance === bestDistance && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  };
  const considerTile = (tx: number, tz: number): void => {
    for (const candidate of index.at(tx, tz) ?? []) consider(candidate);
  };

  for (let ring = 0; ring <= MAX_SNAP_TILES; ring++) {
    // A node in ring r is at least r - 1 tiles off, but one found in an earlier ring's corner can be
    // further, so search on until no node of the next ring could be closer.
    const nearestPossible = Math.max(0, ring - 1) * tileVoxels;
    if (best !== -1 && nearestPossible * nearestPossible >= bestDistance) return best;
    if (ring === 0) {
      considerTile(tileX, tileZ);
      continue;
    }
    for (let d = -ring; d <= ring; d++) {
      considerTile(tileX + d, tileZ - ring);
      considerTile(tileX + d, tileZ + ring);
    }
    for (let d = -ring + 1; d <= ring - 1; d++) {
      considerTile(tileX - ring, tileZ + d);
      considerTile(tileX + ring, tileZ + d);
    }
  }

  // A node past the last ring may still be nearer than anything found inside it.
  for (const [candidate, node] of network.nodes.entries()) {
    if (node.exits.length > 0) consider(candidate);
  }
  return best;
}
