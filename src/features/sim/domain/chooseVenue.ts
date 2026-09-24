import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { appealOf, dominantNeedAt } from './appeal';
import { archetypeOf } from './archetypes';
import { MAX_QUEUE_SHOWN } from './queueLane';
import { strongestNeed, type Needs } from './needs';
import type { Venue } from './venues';
import type { WeatherEffect } from './weather';

export interface VenueChoice {
  readonly venue: number;
  readonly need: GuestNeed;
}

export interface ChoiceOptions {
  readonly needs: Needs;
  readonly guests: Guests;
  readonly person: number;
  readonly venues: readonly Venue[];
  readonly x: number;
  readonly z: number;
  readonly walkingDistance?: (venue: number) => number;
  readonly queueLength?: (venue: number) => number;
  readonly queueLimit?: (venue: number) => number;
  readonly occupants?: (venue: number) => number;
  readonly affinity?: (venue: number) => number;
  // Discounted so a guest does not walk straight back into the place they just
  // left, which would otherwise be the nearest match again.
  readonly justLeft?: number;
  readonly cleanliness?: (venue: number) => number;
  readonly isOpen?: (venue: number) => boolean;
  readonly weather?: WeatherEffect;
}

// Must outweigh the gaps between declared reliefs, or a full line never decides
// anything. One number for the plot: per-venue differences belong in capacity.
const CROWDING = 2;

// Wider than the gaps the layout creates and taste becomes the decision; narrower
// and venues slightly behind on the formula get no visits at all.
export const TASTE_SPREAD = 0.3;

// A half, not zero: somebody who leaves still grubby must be able to turn round.
const REVISIT = 0.5;

// Not zero: a neglected venue must stay a candidate, or it behaves like a
// demolished one and reads as the router failing.
const DIRT_FLOOR = 0.25;

function scoreFor(
  desire: number,
  clean: number,
  distance: number,
  reach: number,
  busy: number,
  capacity: number,
): number {
  return (
    (desire * (DIRT_FLOOR + (1 - DIRT_FLOOR) * clean)) /
    (1 + distance / reach) /
    (1 + (CROWDING * busy) / Math.max(1, capacity))
  );
}

const atCeiling = (): number => MAX_QUEUE_SHOWN;

function distanceTo(options: ChoiceOptions, index: number): number {
  const venue = options.venues[index]!;
  return options.walkingDistance
    ? options.walkingDistance(index)
    : Math.hypot(venue.x - options.x, venue.z - options.z);
}

function weigh(
  options: ChoiceOptions,
  index: number,
  reach: number,
  queueLimit: (venue: number) => number,
  justLeft: number,
): number {
  const { needs, guests, person, queueLength, occupants, affinity } = options;
  const venue = options.venues[index]!;
  const distance = distanceTo(options, index);
  // Infinity means the router found no path.
  if (!Number.isFinite(distance)) return 0;
  // Distance first: the relief counted is the room left once they have walked there.
  const gain = appealOf(venue, needs, guests, person, distance, options.weather);
  if (gain <= 0) return 0;
  const queued = queueLength ? queueLength(index) : 0;
  // The limit the router refuses at, or a guest would cross the plot to be sent back.
  if (queued >= queueLimit(index)) return 0;
  // Occupants count as well as the line: a line forms only once a venue is full.
  const busy = (occupants ? occupants(index) : 0) + queued;
  const desire = gain * (affinity ? affinity(index) : 1) * (index === justLeft ? REVISIT : 1);
  const clean = options.cleanliness ? options.cleanliness(index) : 1;
  return scoreFor(desire, clean, distance, reach, busy, venue.capacity);
}

// strongestNeed only decides whether a guest wants anything; appeal decides where.
export function chooseVenue(options: ChoiceOptions): VenueChoice | null {
  const { needs, guests, person, venues } = options;
  const wanted = options.weather
    ? strongestNeed(needs, guests, person, options.weather)
    : strongestNeed(needs, guests, person);
  if (wanted === null) return null;
  const { reach } = archetypeOf(guests, person);
  const justLeft = options.justLeft ?? -1;
  const queueLimit = options.queueLimit ?? atCeiling;

  const isOpen = options.isOpen;

  let best = -1;
  let bestScore = 0;
  for (let index = 0; index < venues.length; index++) {
    // Skipped here rather than in weigh so a closed venue's walk is never swept.
    if (isOpen && !isOpen(index)) continue;
    const score = weigh(options, index, reach, queueLimit, justLeft);
    if (score <= bestScore) continue;
    bestScore = score;
    best = index;
  }
  if (best < 0) return null;
  const walk = distanceTo(options, best);
  const need =
    dominantNeedAt(venues[best]!, needs, guests, person, walk, options.weather) ?? wanted.need;
  return { venue: best, need };
}
