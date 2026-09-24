import { describe, expect, it } from 'vitest';
import { MAX_SNAP_TILES, nearestNodeTo, nodeIndexFor } from './nearestNode';
import type { WalkNetwork, WalkNode } from './walkNetwork';

const TILE = 10;

const nodeAt = (tileX: number, tileZ: number): WalkNode => ({
  x: (tileX + 0.5) * TILE,
  z: (tileZ + 0.5) * TILE,
  y: 0,
  tileX,
  tileZ,
  exits: [0],
  gate: false,
  seats: [],
});

const networkOf = (nodes: readonly WalkNode[]): WalkNetwork => ({
  nodes,
  edges: [],
  gates: [],
  beach: null,
  seats: [],
  beachSeats: [],
  sand: null,
});

const nearest = (nodes: readonly WalkNode[], x: number, z: number): number => {
  const network = networkOf(nodes);
  return nearestNodeTo(network, nodeIndexFor(network), x, z, TILE);
};

describe('nearestNodeTo', () => {
  it('finds the node on the tile a person is standing on', () => {
    const nodes = [nodeAt(0, 0), nodeAt(3, 0), nodeAt(5, 5)];
    expect(nearest(nodes, 31, 2)).toBe(1);
  });

  it('picks the nearer of two nodes, and the other from the other side', () => {
    const nodes = [nodeAt(0, 0), nodeAt(6, 0)];
    expect(nearest(nodes, 25, 5)).toBe(0);
    expect(nearest(nodes, 40, 5)).toBe(1);
  });

  it('prefers a closer node further out to one at the corner of a nearer ring', () => {
    // (-1, 1) is in ring 1 but farther than (2, 0) in ring 2: stopping at the first
    // non-empty ring would pick the wrong one.
    const nodes = [nodeAt(-1, 1), nodeAt(2, 0)];
    expect(nearest(nodes, 9.5, 0.5)).toBe(1);
  });

  it('prefers a closer node two rings out to one at the corner of an earlier ring', () => {
    // The same trap where searching one ring past the first non-empty one is not enough.
    const nodes = [nodeAt(-3, 3), nodeAt(5, 0)];
    expect(nearest(nodes, 9.99, 0.01)).toBe(1);
  });

  it('finds the true nearest node a long way past the ring search', () => {
    const far = MAX_SNAP_TILES * 3;
    const nodes = [nodeAt(far + 10, 0), nodeAt(far, 0), nodeAt(-far - 5, 0)];
    expect(nearest(nodes, 0, 0)).toBe(1);
  });

  it('prefers a nearer node past the last ring to a farther one inside it', () => {
    const edge = MAX_SNAP_TILES;
    const nodes = [nodeAt(edge, edge), nodeAt(edge + 1, 0)];
    expect(nearest(nodes, 5, 5)).toBe(1);
  });

  it('returns -1 on a network with no nodes', () => {
    expect(nearest([], 12, 12)).toBe(-1);
  });

  it('passes over a node with no exits, since nobody could walk away from it', () => {
    const island = { ...nodeAt(0, 0), exits: [] };
    expect(nearest([island, nodeAt(4, 0)], 5, 5)).toBe(1);
    expect(nearest([island], 5, 5)).toBe(-1);
  });

  it('gives the same node whatever order the nodes are listed in', () => {
    const nodes = [nodeAt(2, 3), nodeAt(-4, 1), nodeAt(7, -2), nodeAt(0, 9), nodeAt(3, 3)];
    const points = [
      [23, 31],
      [-30, 12],
      [70, -10],
      [5, 80],
      [100, 100],
    ] as const;
    const reversed = nodes.toReversed();
    for (const [x, z] of points) {
      const forwards = nodes[nearest(nodes, x, z)];
      const backwards = reversed[nearest(reversed, x, z)];
      expect(backwards, `${x},${z}`).toBe(forwards);
    }
  });
});
