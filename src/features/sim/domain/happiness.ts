/**
 * How good a time each guest is having.
 *
 * A column parallel to `Guests` and keyed by the same person index, in the shape
 * of `needs.ts` and for the same reason: identity is written once when somebody
 * checks in, and this is rewritten every tick. Keeping it apart means the
 * per-tick loop touches only the array it ages, and an edit that reseats the
 * crowd carries it through untouched.
 *
 * ## Happiness follows the needs rather than being a sixth one
 *
 * A guest whose needs are all seen to drifts up towards content, and a guest who
 * is starving drifts down. It is not a thing that decays on its own, because
 * there is nothing on the plot a player could build to relieve it directly - what
 * they build is a bakery, and the bakery shows up here through hunger.
 *
 * It moves slowly, at {@link DRIFT_PER_HOUR}, so one long queue does not undo a
 * good day and one good lunch does not undo a bad one. That slowness is the
 * whole point: a rating read off a number that could swing in ten minutes would
 * say nothing about how the resort is built.
 *
 * ## The target is the plain mean of the five needs
 *
 * Unweighted, and deliberately not `archetypes.ts`'s weights. Those say what a
 * guest will cross the plot *for*, which is a question about where they walk
 * next; whether they had a good week is a different question, and a family that
 * cares more about food than about fun is not a family that enjoys being grubby.
 *
 * ## Whole ticks, never a frame's delta
 *
 * Handed the ticks the clock produced, exactly as `decayNeeds` is, and for the
 * reason `simClock.ts` gives at length: a mood aged by the frame's own delta
 * would age faster on a fast machine.
 */

import type { Guests } from '../../guests/domain/guests';
import { NEEDS, type Needs } from './needs';

/** Minutes in the hour the rates below are quoted per; a tick is one minute. */
const TICKS_PER_HOUR = 60;

/**
 * How far towards the mean of their needs a guest's mood moves in an hour.
 *
 * A day of misery takes a guest who arrived delighted to nearly nothing - seven
 * hours of it, so a bad morning is visible by lunch and recoverable by evening -
 * and a day of comfort restores them. Slow enough that the rating is about how
 * the resort is built rather than about what happened in the last ten minutes.
 */
export const DRIFT_PER_HOUR = 0.15;

/**
 * What an hour of standing in a line costs on top of the drift.
 *
 * Twice the drift, so waiting is worse than any need running down: queueing is
 * the one thing a guest experiences that no need column records, and it is the
 * whole reason a player builds a second bakery rather than admiring the line at
 * the first.
 */
export const QUEUE_COST_PER_HOUR = 0.3;

/**
 * How happy somebody is when they check in: pleased to be here, with room to be
 * disappointed.
 *
 * Named for the arrival rather than `START_LEVEL`, which is what `needs.ts`
 * calls its own: two exports of one name in one folder resolve ambiguously
 * through a barrel, and `fallow:audit` is right to say so.
 *
 * Not 1, or a resort could only ever make people less happy than they arrived
 * and every rating would be a subtraction from five stars.
 */
export const ARRIVAL_MOOD = 0.7;

export interface Happiness {
  readonly count: number;
  /** How happy each person is, 0..1. 1 is delighted. */
  readonly level: Float32Array;
}

const clamp = (level: number): number => (level < 0 ? 0 : level > 1 ? 1 : level);

export function createHappiness(count: number): Happiness {
  const people = Math.max(0, Math.floor(count));
  return { count: people, level: new Float32Array(people).fill(ARRIVAL_MOOD) };
}

/** The mean of somebody's five need levels: what their mood drifts towards. */
function contentmentOf(needs: Needs, person: number): number {
  let total = 0;
  for (const need of NEEDS) total += needs.level[need][person]!;
  return total / NEEDS.length;
}

/**
 * Runs `ticks` simulated minutes of mood over everybody present.
 *
 * Allocates nothing: it runs up to `MAX_TICKS_PER_ADVANCE` times a frame over
 * every guest on the plot, beside `decayNeeds` and on the same ticks.
 *
 * A person with `present === 0` is skipped entirely. Their level is the previous
 * guest's and is about to be overwritten by `checkInParty`, and ageing it would
 * be ageing the mood of somebody who went home a week ago.
 */
export function ageHappiness(
  happiness: Happiness,
  needs: Needs,
  guests: Guests,
  waiting: (person: number) => boolean,
  ticks: number,
): void {
  if (ticks <= 0) return;
  const hours = ticks / TICKS_PER_HOUR;
  const drift = DRIFT_PER_HOUR * hours;
  const queued = QUEUE_COST_PER_HOUR * hours;
  for (let person = 0; person < happiness.count; person++) {
    if (guests.present[person] !== 1) continue;
    const level = happiness.level[person]!;
    const towards = contentmentOf(needs, person) - level;
    // Towards the target and never past it, so a long frame's worth of ticks
    // settles at contentment rather than overshooting into misery.
    const moved = towards < 0 ? Math.max(towards, -drift) : Math.min(towards, drift);
    happiness.level[person] = clamp(level + moved - (waiting(person) ? queued : 0));
  }
}

/**
 * The mean happiness of everybody on the plot, or null when nobody is.
 *
 * Null rather than 0, because an empty resort has not made anybody unhappy: see
 * `rating.ts`, which gives it the benefit of the doubt.
 */
export function meanHappiness(happiness: Happiness, guests: Guests): number | null {
  let total = 0;
  let people = 0;
  for (let person = 0; person < happiness.count; person++) {
    if (guests.present[person] !== 1) continue;
    total += happiness.level[person]!;
    people++;
  }
  return people === 0 ? null : total / people;
}
