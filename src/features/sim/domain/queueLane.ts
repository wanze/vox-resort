/**
 * Where the people waiting at a door stand: a lane walked back along the paving.
 *
 * A line is placed rather than walked: the n-th person is put on the n-th spot
 * outright, and when the line shuffles up they are put on the spot in front.
 * At the distance the camera sits that reads as a queue, and it costs nothing
 * per frame. See `occupancy.ts`, which decides who is in which place.
 *
 * ## Along the graph, not along a ray
 *
 * The spots used to be a straight line out from the venue's middle through the
 * door, and nothing about that line had ever seen the paving: it left the path
 * at the first person and crossed the grass, the flowerbeds and whatever else
 * stood there, and a queue off a terrace hung in the air. So the lane is walked
 * over the walk graph instead - from the door node, always on to the neighbour
 * that leads furthest from the venue - and every spot is a point on an edge,
 * height included. A queue running down a flight of steps stands on the steps.
 *
 * A lane that runs out of graph is **short**, and that is an answer rather than
 * an error: a venue reached down a two-tile spur has room for a line of two.
 * The router caps the queue at the lane's length. See `router.ts`.
 *
 * Nothing here knows what a venue is beyond where its middle is, and nothing
 * here touches the crowd: it answers points and headings, and the router is
 * what stands anybody on one.
 */

import type { WalkNetwork } from '../../crowd/domain/walkNetwork';

/** Voxels between two people in a line: a body and a little air. */
const QUEUE_SPACING = 6;

/**
 * The most people who will stand in a line before the rest give up.
 *
 * A **ceiling** rather than the length: the real length is the venue's own lane,
 * which is shorter wherever the paving in front of the door runs out. Anything
 * reading this as "how many are waiting" is wrong. `arriveAt` balks at it and
 * `chooseVenue` refuses a venue that has reached it, both by importing it rather
 * than naming a second threshold of their own.
 */
export const MAX_QUEUE_SHOWN = 12;

export interface QueueSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** Which way they face: towards whoever is in front, so a line reads as one. */
  readonly heading: number;
}

/**
 * Where each of the {@link MAX_QUEUE_SHOWN} people at this door stands, front
 * first. Never empty: slot 0 stands on the door node itself.
 *
 * Built once per venue when its flow field is, and thrown away with it: every
 * position in it is a point on a graph that a rebuild renumbers.
 *
 * Headings follow `crowd.ts`'s own convention, `atan2(dx, dz)` of the way
 * somebody would travel - here towards the spot in front, and for the one at
 * the front towards the venue's middle. A queue facing backwards is a sign
 * error here and nowhere else.
 */
export function queueLaneFor(
  network: WalkNetwork,
  door: number,
  venueCentre: { readonly x: number; readonly z: number },
): readonly QueueSpot[] {
  const start = network.nodes[door]!;
  const spots: QueueSpot[] = [
    {
      x: start.x,
      z: start.z,
      y: start.y,
      heading: Math.atan2(venueCentre.x - start.x, venueCentre.z - start.z),
    },
  ];
  let at = door;
  // How far along the path the next person stands from wherever the walk is.
  let untilNext = QUEUE_SPACING;

  while (spots.length < MAX_QUEUE_SHOWN) {
    const edge = awayFrom(network, at, venueCentre);
    if (edge === -1) break;
    const { to, length } = network.edges[edge]!;
    const from = network.nodes[at]!;
    const end = network.nodes[to]!;
    let along = 0;
    while (untilNext <= length - along && spots.length < MAX_QUEUE_SHOWN) {
      along += untilNext;
      untilNext = QUEUE_SPACING;
      const t = along / length;
      const x = from.x + (end.x - from.x) * t;
      const z = from.z + (end.z - from.z) * t;
      const ahead = spots.at(-1)!;
      spots.push({
        x,
        z,
        y: from.y + (end.y - from.y) * t,
        heading: Math.atan2(ahead.x - x, ahead.z - z),
      });
    }
    untilNext -= length - along;
    at = to;
  }
  return spots;
}

/**
 * The edge out of `at` onto the neighbour furthest from the venue, or -1 where
 * no neighbour is further from it than `at` is.
 *
 * Only ever further: a lane that turned back along the paving would wrap round
 * the building it is queuing for, and one that ran sideways at the same
 * distance could circle it. It is also what keeps a lane from looping back on
 * itself without a visited set - a walk whose distance only grows cannot
 * arrive anywhere twice. Ties go to the lower node index, so the same plot lays
 * the same lane twice.
 */
function awayFrom(
  network: WalkNetwork,
  at: number,
  centre: { readonly x: number; readonly z: number },
): number {
  const here = network.nodes[at]!;
  let best = -1;
  let bestNode = -1;
  let bestDistance = Math.hypot(here.x - centre.x, here.z - centre.z);
  for (const edge of here.exits) {
    const to = network.edges[edge]!.to;
    const node = network.nodes[to]!;
    const distance = Math.hypot(node.x - centre.x, node.z - centre.z);
    const further = distance > bestDistance || (distance === bestDistance && to < bestNode);
    if (!further) continue;
    best = edge;
    bestNode = to;
    bestDistance = distance;
  }
  return best;
}
