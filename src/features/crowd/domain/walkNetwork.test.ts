import { describe, expect, it } from 'vitest';
import { BRIDGE_VOXELS, LEVEL_VOXELS, TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { LevelProvider } from '../../layout/domain/elevation';
import { shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { createRandom } from '../../layout/domain/random';
import {
  BEACH_SURFACE,
  beachPointAt,
  OFF_THE_GRAPH,
  walkingSurface,
  walkNetworkFor,
  type PavedTile,
  type WalkNetwork,
  type WalkNode,
} from './walkNetwork';
import type { SeatSpot } from './seating';

/** A flat run of paved tiles along z, all at sea level. */
const flat = (tiles: readonly (readonly [number, number])[]): PavedTile[] =>
  tiles.map(([tileX, tileZ]) => ({ tileX, tileZ, y: 0 }));

/** Everything at sea level. */
const FLAT: LevelProvider = () => 0;

/** One terrace behind z = 0, so a step runs across the plot at z = 1. */
const STEP_AT_Z1: LevelProvider = (_x, z) => (z <= 0 ? 1 : 0);

/** Higher ground both north and west, which is a path turning on a step. */
const CORNER: LevelProvider = (x, z) => (z <= 0 || x <= 0 ? 1 : 0);

/** Two levels in one step, which no flight could climb. */
const CLIFF_AT_Z1: LevelProvider = (_x, z) => (z <= 0 ? 2 : 0);

const nodeAt = (network: WalkNetwork, x: number, z: number): number =>
  network.nodes.findIndex((node) => node.tileX === x && node.tileZ === z);

/** Every node a tile holds, lowest first: one, or the two ends of a flight. */
const standsOn = (network: WalkNetwork, x: number, z: number): WalkNode[] =>
  network.nodes
    .filter((node) => node.tileX === x && node.tileZ === z)
    .toSorted((a, b) => a.y - b.y);

/** The tiles a node can be walked to from here. */
const reachable = (network: WalkNetwork, from: number): string[] =>
  network.nodes[from]!.exits.map((edge) => {
    const to = network.nodes[network.edges[edge]!.to]!;
    return `${to.tileX},${to.tileZ}`;
  }).toSorted();

describe('walkNetworkFor', () => {
  it('joins paved neighbours and leaves the diagonals alone', () => {
    // A plus: the centre reaches all four arms, and no arm reaches another.
    const network = walkNetworkFor({
      paved: flat([
        [1, 1],
        [0, 1],
        [2, 1],
        [1, 0],
        [1, 2],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
    });
    expect(reachable(network, nodeAt(network, 1, 1))).toEqual(['0,1', '1,0', '1,2', '2,1']);
    expect(reachable(network, nodeAt(network, 0, 1))).toEqual(['1,1']);
  });

  it('stores every adjacency in both directions', () => {
    const network = walkNetworkFor({
      paved: flat([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
    });
    expect(network.edges).toHaveLength(4);
    for (const edge of network.edges) {
      const back = network.edges.find((other) => other.from === edge.to && other.to === edge.from);
      expect(back, `${edge.from} -> ${edge.to} has no way back`).toBeDefined();
    }
  });

  it('stands a node on the top of its own paving, not on the ground', () => {
    const network = walkNetworkFor({
      paved: [{ tileX: 3, tileZ: 4, y: LEVEL_VOXELS }],
      levelOf: FLAT,
      shore: null,
      tilesX: 8,
    });
    const node = network.nodes[0]!;
    expect(node.y).toBe(walkingSurface(LEVEL_VOXELS));
    expect([node.x, node.z]).toEqual([3.5 * TILE_VOXELS, 4.5 * TILE_VOXELS]);
  });

  describe('a step between two terraces', () => {
    // z = 0 is the upper terrace and z = 1 the lower, so the flight sits on
    // (0, 1) and climbs north — which is what `stairs.ts` decides for it.
    const levelOf = STEP_AT_Z1;
    const paved = [
      { tileX: 0, tileZ: 0, y: LEVEL_VOXELS },
      { tileX: 0, tileZ: 1, y: 0 },
    ];

    it('stands a node at each end of the flight, not one in the middle of it', () => {
      // The ramp runs the width of the tile, from the paving it continues to the
      // paving above. A single node at the tile's centre would carry the height
      // of the ground *under* the flight, half a level below the treads there —
      // and a crowd walking to it wades through the staircase to the shoulders,
      // which is exactly what looking at the resort showed. See `standFor`.
      const [foot, head] = standsOn(
        walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 }),
        0,
        1,
      );
      expect(foot!.y).toBe(walkingSurface(0));
      expect(head!.y).toBe(walkingSurface(LEVEL_VOXELS));
      // On the tile's own two edges, a full tile apart: the segment between them
      // is the flight, so lerping it *is* the climb.
      expect([foot!.x, foot!.z]).toEqual([0.5 * TILE_VOXELS, 2 * TILE_VOXELS]);
      expect([head!.x, head!.z]).toEqual([0.5 * TILE_VOXELS, 1 * TILE_VOXELS]);
    });

    it('meets the paving above flush, and the paving below at its foot', () => {
      const network = walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 });
      const [, head] = standsOn(network, 0, 1);
      const above = network.nodes[nodeAt(network, 0, 0)]!;
      // Flush, so a person steps off the top tread onto the slab without a jump,
      // and the last stretch to the tile centre is flat.
      expect(head!.y).toBe(above.y);
      expect(Math.abs(above.z - head!.z)).toBe(TILE_VOXELS / 2);
    });

    it('lets a person climb the flight, in both directions', () => {
      const network = walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 });
      // The climb and the flat run onto the terrace above, both ways round.
      expect(network.edges).toHaveLength(4);
      for (const edge of network.edges) {
        const back = network.edges.find(
          (other) => other.from === edge.to && other.to === edge.from,
        );
        expect(back, `${edge.from} -> ${edge.to} has no way back`).toBeDefined();
      }
      const [foot, head] = standsOn(network, 0, 1);
      const climb = network.edges.find(
        (edge) => network.nodes[edge.from] === foot && network.nodes[edge.to] === head,
      );
      expect(climb).toBeDefined();
    });

    it('measures the climb rather than the tile, so stairs take longer', () => {
      const network = walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 });
      const lengths = network.edges.map((edge) => edge.length).toSorted((a, b) => a - b);
      // Two halves of a tile onto the terrace above, and the flight itself.
      expect(lengths[0]).toBeCloseTo(TILE_VOXELS / 2);
      expect(lengths.at(-1)).toBeCloseTo(Math.hypot(TILE_VOXELS, LEVEL_VOXELS));
    });

    it('carries the climb in the two node heights, so a walk up it is a lerp', () => {
      const [foot, head] = standsOn(
        walkNetworkFor({ paved, levelOf, shore: null, tilesX: 4 }),
        0,
        1,
      );
      expect(head!.y - foot!.y).toBe(LEVEL_VOXELS);
    });
  });

  it('sends a path that runs into the side of a flight round its foot', () => {
    // `stairs.ts` makes a flight of any paved tile with paved ground a level
    // above it, corridor tiles included — so a path sometimes crosses a flight
    // at right angles to the climb. Refusing that pair strands the corridor
    // behind it; the foot is where a person would go round. See `standFor`.
    const network = walkNetworkFor({
      paved: [
        { tileX: 1, tileZ: 1, y: 0 },
        { tileX: 1, tileZ: 0, y: LEVEL_VOXELS },
        { tileX: 0, tileZ: 1, y: 0 },
        { tileX: 2, tileZ: 1, y: 0 },
      ],
      levelOf: STEP_AT_Z1,
      shore: null,
      tilesX: 4,
    });
    const [foot] = standsOn(network, 1, 1);
    for (const beside of [nodeAt(network, 0, 1), nodeAt(network, 2, 1)]) {
      const across = network.nodes[beside]!.exits.map(
        (edge) => network.nodes[network.edges[edge]!.to],
      );
      expect(across, `${beside} lost its way across`).toContain(foot);
      // At the height it was already walking at, rather than up the side wall.
      expect(foot!.y).toBe(network.nodes[beside]!.y);
    }
  });

  it('refuses the side of a staircase, where a path turns on a step', () => {
    // The corner (1, 1) is low with higher paved ground both north and west, so
    // one tile would have to climb two ways. `stairs.ts` gives it the first by
    // compass order — north — and the pair to the west is then a wall.
    const network = walkNetworkFor({
      paved: [
        { tileX: 1, tileZ: 1, y: 0 },
        { tileX: 1, tileZ: 0, y: LEVEL_VOXELS },
        { tileX: 0, tileZ: 1, y: LEVEL_VOXELS },
      ],
      levelOf: CORNER,
      shore: null,
      tilesX: 4,
    });
    // The flight's head reaches the ground it climbs to, and the terrace to the
    // west is walled off: nothing on the corner tile reaches it at all.
    const [, head] = standsOn(network, 1, 1);
    // Its own foot, back down the flight, and the terrace it climbs to.
    expect(reachable(network, network.nodes.indexOf(head!))).toEqual(['1,0', '1,1']);
    expect(reachable(network, nodeAt(network, 0, 1))).toEqual([]);
    for (const node of standsOn(network, 1, 1)) {
      const reached = node.exits.map((edge) => {
        const to = network.nodes[network.edges[edge]!.to]!;
        return `${to.tileX},${to.tileZ}`;
      });
      expect(reached, 'the corner climbed west as well').not.toContain('0,1');
    }
  });

  it('refuses a drop of more than one level, which no flight could climb', () => {
    const network = walkNetworkFor({
      paved: [
        { tileX: 0, tileZ: 0, y: LEVEL_VOXELS * 2 },
        { tileX: 0, tileZ: 1, y: 0 },
      ],
      levelOf: CLIFF_AT_Z1,
      shore: null,
      tilesX: 4,
    });
    expect(network.edges).toEqual([]);
  });
});

/** Inland water two tiles wide, which a crossing of it stands a metre above. */
const RIVER = (_x: number, tileZ: number): boolean => tileZ === 2 || tileZ === 3;

/** The same channel a tile wider, so a crossing of it has a level middle. */
const WIDE_RIVER = (_x: number, tileZ: number): boolean => tileZ >= 2 && tileZ <= 4;

describe('a crossing over a river', () => {
  // A channel two tiles wide at z = 2 and z = 3, with the street running over
  // it: two ramps meeting at their heads, and a bank either side.
  const paved = flat([
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ]);
  const network = (): WalkNetwork =>
    walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 4, bridged: RIVER });

  it('stands a node at each end of a ramp, as it does on a flight', () => {
    // The same reason: the surface runs from the paving it continues to the deck
    // above across the width of the tile, so one node at the centre would leave
    // a person walking through the planking. See `standFor`.
    const [foot, head] = standsOn(network(), 0, 2);
    expect(foot!.y).toBe(walkingSurface(0));
    expect(head!.y).toBe(BRIDGE_VOXELS);
    // The foot at the bank edge of the tile and the head at the far one.
    expect(foot!.z).toBe(2 * TILE_VOXELS);
    expect(head!.z).toBe(3 * TILE_VOXELS);
  });

  it('lets two ramps meet at one node, the way two flights share a landing', () => {
    const crossing = network();
    const [, head] = standsOn(crossing, 0, 2);
    const far = standsOn(crossing, 0, 3);
    // The crown is one place, so the second ramp hangs its head on the same
    // node and there is no zero-length edge between two points that are one.
    expect(far.map((node) => node.y)).toEqual([walkingSurface(0)]);
    expect(head!.z).toBe(3 * TILE_VOXELS);
  });

  it('walks the whole crossing, bank to bank, in both directions', () => {
    const crossing = network();
    for (const edge of crossing.edges) {
      const back = crossing.edges.find((other) => other.from === edge.to && other.to === edge.from);
      expect(back, `${edge.from} -> ${edge.to} has no way back`).toBeDefined();
    }
    // Every node is reachable from the near bank.
    const seen = new Set([nodeAt(crossing, 0, 1)]);
    for (let more = true; more;) {
      more = false;
      for (const edge of crossing.edges) {
        if (seen.has(edge.from) && !seen.has(edge.to)) {
          seen.add(edge.to);
          more = true;
        }
      }
    }
    expect(seen.size).toBe(crossing.nodes.length);
  });

  it('stands on the deck of a crossing wide enough to have one', () => {
    const deck = walkNetworkFor({
      paved: flat([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
      bridged: WIDE_RIVER,
    });
    // One node, at the middle tile's centre, a metre above the water it spans.
    const middle = standsOn(deck, 0, 3);
    expect(middle.map((node) => node.y)).toEqual([BRIDGE_VOXELS]);
    expect(middle[0]!.z).toBe(3.5 * TILE_VOXELS);
  });

  it('leaves a pier flat, because nothing told it the paving was raised', () => {
    // The same four tiles with no `bridged` at all, which is a jetty out over
    // the bay and every plot with no river on it.
    const pier = walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 4 });
    for (const node of pier.nodes) expect(node.y).toBe(walkingSurface(0));
  });
});

describe('the gates onto the beach', () => {
  // Water from z = 8, four rows of sand in front of it: z = 4..7 is beach.
  const shore = shoreFor({
    tilesX: 10,
    tilesZ: 10,
    shore: { inset: 1, beach: 4, wave: 0, seed: 1 },
  });

  it('finds none on a plot with no coast', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
    });
    expect(network.gates).toEqual([]);
    expect(network.beach).toBeNull();
  });

  it('opens a gate where paving has open sand beside it', () => {
    const network = walkNetworkFor({
      // A boardwalk running down into the sand, and one tile up on the grass.
      paved: flat([
        [5, 3],
        [5, 4],
        [5, 5],
      ]),
      levelOf: FLAT,
      shore,
      tilesX: 10,
    });
    // (5, 3) is on grass but touches the first row of sand at (5, 4)... which is
    // paved, so it is not open. Its neighbours (4, 3) and (6, 3) are grass.
    expect(network.nodes[nodeAt(network, 5, 3)]!.gate).toBe(false);
    // The two on the sand have open sand either side of them.
    expect(network.nodes[nodeAt(network, 5, 4)]!.gate).toBe(true);
    expect(network.nodes[nodeAt(network, 5, 5)]!.gate).toBe(true);
    expect(network.gates).toHaveLength(2);
  });
});

describe('beachPointAt', () => {
  const shore = shoreFor({
    tilesX: 40,
    tilesZ: 30,
    shore: { inset: 3, beach: 5, wave: 2, seed: 4 },
  })!;
  const beach = { shore, tilesX: 40 };

  it('lands on sand, in every column, however the coast wanders', () => {
    const random = createRandom(12);
    for (let draw = 0; draw < 400; draw++) {
      const point = beachPointAt(beach, random);
      const tileX = Math.floor(point.x / TILE_VOXELS);
      const tileZ = Math.floor(point.z / TILE_VOXELS);
      expect(tileX, 'off the west or east end of the plot').toBeGreaterThanOrEqual(0);
      expect(tileX, 'off the west or east end of the plot').toBeLessThan(40);
      // Asked of the shore itself rather than of our own arithmetic: the whole
      // point is that a roamer never has to.
      expect(terrainAt(shore, tileX, tileZ), `${tileX},${tileZ}`).toBe('beach');
    }
  });

  it('spreads over the sand rather than over the tile centres', () => {
    const random = createRandom(5);
    const xs = new Set<number>();
    for (let draw = 0; draw < 50; draw++) xs.add(beachPointAt(beach, random).x % TILE_VOXELS);
    expect(xs.size).toBeGreaterThan(40);
  });

  it('replays the same beach for the same seed', () => {
    const walk = (): number[] => {
      const random = createRandom(9);
      return Array.from({ length: 20 }, () => beachPointAt(beach, random)).flatMap((point) => [
        point.x,
        point.z,
      ]);
    };
    expect(walk()).toEqual(walk());
  });
});

/** A seat standing in the middle of a tile, at the height of its paving. */
const seatOn = (tileX: number, tileZ: number, y = walkingSurface(0)): SeatSpot => ({
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
  y,
  heading: 0,
  pose: 'sit',
  tileX,
  tileZ,
});

describe('the seats a network hangs off its nodes', () => {
  it('hangs a seat off the node of its own tile', () => {
    const network = walkNetworkFor({
      paved: flat([
        [0, 0],
        [1, 0],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
      seats: [seatOn(1, 0)],
    });
    expect(network.seats).toHaveLength(1);
    expect(network.seats[0]!.node).toBe(nodeAt(network, 1, 0));
    expect(network.nodes[nodeAt(network, 1, 0)]!.seats).toEqual([0]);
    expect(network.nodes[nodeAt(network, 0, 0)]!.seats).toEqual([]);
  });

  it('reaches a seat on an unpaved tile from the paving beside it', () => {
    // The bench the layout actually stands: on the grass, against a path.
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
      seats: [seatOn(0, 1)],
    });
    expect(network.seats).toHaveLength(1);
    expect(network.seats[0]!.node).toBe(nodeAt(network, 0, 0));
  });

  it('takes the nearest paving when a seat has a choice of it', () => {
    const network = walkNetworkFor({
      paved: flat([
        [0, 0],
        [3, 0],
      ]),
      levelOf: FLAT,
      shore: null,
      tilesX: 6,
      // On the tile next to the first, and three tiles from the second.
      seats: [seatOn(1, 0)],
    });
    expect(network.seats[0]!.node).toBe(nodeAt(network, 0, 0));
  });

  it('drops a seat with no paving within a tile of it', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 8,
      seats: [seatOn(4, 4)],
    });
    expect(network.seats).toEqual([]);
    expect(network.nodes[nodeAt(network, 0, 0)]!.seats).toEqual([]);
  });

  it('drops a seat a whole terrace above its paving', () => {
    // A bench on the terrace above a path is not something to walk up to; the
    // flight is, and it is somewhere else. Half a level is allowed, because a
    // seat names the layer a sitter's hips are at.
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
      seats: [seatOn(0, 1, walkingSurface(0) + LEVEL_VOXELS), seatOn(1, 0, walkingSurface(0) + 3)],
    });
    expect(network.seats).toHaveLength(1);
    expect(network.seats[0]!.y).toBe(walkingSurface(0) + 3);
  });

  it('keeps every seat of a bench, and in the order they came in', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 4,
      seats: [seatOn(0, 1), seatOn(0, 1), seatOn(0, 1)],
    });
    expect(network.seats).toHaveLength(3);
    expect(network.nodes[nodeAt(network, 0, 0)]!.seats).toEqual([0, 1, 2]);
  });

  it('offers none when the plot has nothing to sit on', () => {
    expect(
      walkNetworkFor({ paved: flat([[0, 0]]), levelOf: FLAT, shore: null, tilesX: 4 }).seats,
    ).toEqual([]);
  });
});

describe('the seats out on the sand', () => {
  // Water from z = 8, four rows of sand in front of it: z = 4..7 is beach.
  const shore = shoreFor({
    tilesX: 10,
    tilesZ: 10,
    shore: { inset: 1, beach: 4, wave: 0, seed: 1 },
  });

  /** A lounger's worth of seat, on the sand at this tile. */
  const lounger = (tileX: number, tileZ: number): SeatSpot => ({
    ...seatOn(tileX, tileZ, BEACH_SURFACE + 5),
    pose: 'lie',
  });

  it('keeps a lounger on the sand, hung off no node at all', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore,
      tilesX: 10,
      seats: [lounger(5, 6)],
    });
    // Nowhere near the one paved tile, and kept anyway: the sand is walked on.
    expect(network.seats).toHaveLength(1);
    expect(network.seats[0]!.node).toBe(OFF_THE_GRAPH);
    expect(network.beachSeats).toEqual([0]);
    expect(network.seats[0]!.pose).toBe('lie');
  });

  it('still prefers the paving where a seat has both', () => {
    const network = walkNetworkFor({
      // A boardwalk tile out on the sand, with a seat on the tile beside it.
      paved: [{ tileX: 5, tileZ: 6, y: 0 }],
      levelOf: FLAT,
      shore,
      tilesX: 10,
      seats: [{ ...seatOn(5, 5, walkingSurface(0) + 2), pose: 'sit' }],
    });
    expect(network.seats[0]!.node).toBe(nodeAt(network, 5, 6));
    expect(network.beachSeats).toEqual([]);
  });

  it('drops a seat that is neither on sand nor near paving', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore,
      // On the grass behind the beach, four tiles from the only paving there is.
      seats: [seatOn(5, 2)],
      tilesX: 10,
    });
    expect(network.seats).toEqual([]);
    expect(network.beachSeats).toEqual([]);
  });

  it('finds no beach seats on a plot with no coast', () => {
    const network = walkNetworkFor({
      paved: flat([[0, 0]]),
      levelOf: FLAT,
      shore: null,
      tilesX: 10,
      seats: [lounger(5, 6)],
    });
    expect(network.seats).toEqual([]);
    expect(network.beachSeats).toEqual([]);
  });
});
