/**
 * Where the people waiting at a door stand.
 *
 * A line is placed rather than walked: the n-th person is put on the n-th spot
 * outright, and when the line shuffles up they are put on the spot in front.
 * At the distance the camera sits that reads as a queue, and it costs one
 * `atan2` per person per shuffle instead of a path per person per step. See
 * `occupancy.ts`, which decides who is in which place.
 *
 * Nothing here knows what a venue is beyond where its middle is, and nothing
 * here touches the crowd: it answers a point and a heading, and the router is
 * what stands anybody on one.
 */

import type { WalkNode } from '../../crowd/domain/walkNetwork';

/** Voxels between two people in a line: a body and a little air. */
const QUEUE_SPACING = 6;

/**
 * The most people who will stand in a line before the rest give up.
 *
 * One number doing two jobs - how long a line is drawn and when a guest refuses
 * to join one - so the player never sees a line longer than the one guests walk
 * away from. `arriveAt` balks at it and `chooseVenue` refuses to choose a venue
 * that has reached it, both by importing this rather than naming a second
 * threshold of their own.
 */
export const MAX_QUEUE_SHOWN = 12;

export interface QueueSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** Which way they face: towards the door, so a queue reads as a queue. */
  readonly heading: number;
}

/**
 * Where the `slot`-th person waiting at this door stands.
 *
 * The line runs away from the venue along the door node's own outward
 * direction, which is the direction from the venue's centre to the door: a
 * queue that ran towards the building would stand inside it.
 *
 * `heading` is `atan2` of the direction *back* to the door, which is the
 * convention `crowd.ts`'s own `segment` writes - `atan2(dx, dz)` of the way
 * somebody is travelling. A queue facing the wrong way is a sign error here
 * and nowhere else.
 *
 * `y` is the door node's own, unchanged: a queue at a door on a terrace stands
 * on the terrace.
 */
export function queueSpotAt(
  door: WalkNode,
  venueCentre: { readonly x: number; readonly z: number },
  slot: number,
): QueueSpot {
  const dx = door.x - venueCentre.x;
  const dz = door.z - venueCentre.z;
  const length = Math.hypot(dx, dz);
  // A venue whose only walkable node is under its own middle has no outward
  // direction at all. East is arbitrary, and it has to be something: the
  // alternative is a line of people on one voxel.
  const outX = length > 0 ? dx / length : 1;
  const outZ = length > 0 ? dz / length : 0;
  const back = slot * QUEUE_SPACING;
  return {
    x: door.x + outX * back,
    z: door.z + outZ * back,
    y: door.y,
    heading: Math.atan2(-outX, -outZ),
  };
}
