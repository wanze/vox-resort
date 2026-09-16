/**
 * What every guest wants seen to, and how that runs down over a day.
 *
 * Columns parallel to `Guests` and keyed by the same person index, for the
 * reason `Guests` is not columns on `Crowd`: identity is written once when the
 * resort is built, and this is rewritten every tick. Keeping them apart means
 * the per-tick loop touches only the arrays it decays, and an edit that reseats
 * the crowd carries both through untouched.
 *
 * ## 1 is content and 0 is desperate
 *
 * That is the way round the art already reads: a bakery declares
 * `{ need: 'hunger', amount: 0.5 }`, and a visit *adds* half the need back. A
 * level that counted upwards would make every model's amount a subtraction and
 * every comparison a `>` that reads as a `<`.
 *
 * ## Whole ticks, never a frame's delta
 *
 * `decayNeeds` is handed the ticks the clock produced, and a tick is a
 * simulated minute. A need that decayed by the frame's own delta would decay
 * faster on a fast machine, which `simClock.ts` explains at length and
 * `docs/rendering.md` requires of anything in the animation loop.
 */

import type { GuestNeed, NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { archetypeOf } from './archetypes';

/** Every need, in the order the HUD lists them. */
export const NEEDS: readonly GuestNeed[] = ['hunger', 'thirst', 'energy', 'fun', 'hygiene'];

/** Minutes in the hour the decay rates are quoted per; a tick is one minute. */
const TICKS_PER_HOUR = 60;

/**
 * How met a need starts out, for the reason `createGuests` spreads arrivals
 * over their own stays: a resort where everybody gets hungry at the same minute
 * empties the paths all at once and fills them all at once, which is a queue
 * rather than a crowd. Nobody starts desperate, so the first hour of a new plot
 * is quiet.
 */
export const START_LEVEL = { min: 0.45, max: 1 } as const;

/**
 * Below this, a need is not worth crossing the plot for and a guest is treated
 * as content. Without it everybody always wants the least-met of five things,
 * however well met it is, and the resort reads as a crowd that can never sit
 * still. At a weight of 1 it is a need about a fifth run down.
 */
const CONTENT_URGENCY = 0.2;

export interface Needs {
  readonly count: number;
  /**
   * How well each need is met, 0..1, one column per need. **1 is content and 0
   * is desperate**, which is the way round the art's `amount` already reads: a
   * relief of 0.5 adds half a need back.
   */
  readonly level: { readonly [need in GuestNeed]: Float32Array };
}

const clamp = (level: number): number => (level < 0 ? 0 : level > 1 ? 1 : level);

/**
 * Everybody's starting mood, drawn from one seeded generator.
 *
 * Drawn **person by person, and within each person in {@link NEEDS} order**.
 * The order is load-bearing: changing it reshuffles every level drawn after the
 * one that moved, and so changes the scene a benchmark run compares against.
 */
export function createNeeds(guests: Guests, seed: number): Needs {
  const random = createRandom(seed);
  const span = START_LEVEL.max - START_LEVEL.min;
  const level = {
    hunger: new Float32Array(guests.count),
    thirst: new Float32Array(guests.count),
    energy: new Float32Array(guests.count),
    fun: new Float32Array(guests.count),
    hygiene: new Float32Array(guests.count),
  };
  for (let person = 0; person < guests.count; person++) {
    for (const need of NEEDS) level[need][person] = START_LEVEL.min + random() * span;
  }
  return { count: guests.count, level };
}

/**
 * Draws one person's needs afresh, in {@link NEEDS} order: somebody has just
 * checked in, and the body they were dealt was somebody else's a moment ago.
 *
 * Here rather than in `checkIn.ts` so {@link START_LEVEL} has one reader and the
 * draw order stays this module's own - it is the same order {@link createNeeds}
 * uses, and the note there about it being load-bearing applies to both.
 */
export function resetNeeds(needs: Needs, person: number, random: () => number): void {
  if (person < 0 || person >= needs.count) return;
  const span = START_LEVEL.max - START_LEVEL.min;
  for (const need of NEEDS) needs.level[need][person] = START_LEVEL.min + random() * span;
}

/**
 * Runs `ticks` whole simulated minutes of decay over everybody.
 *
 * Allocates nothing: it runs up to `MAX_TICKS_PER_ADVANCE` times a frame over
 * every guest on the plot, and it is the first thing the simulation does on a
 * tick, so everything else the tick grows queues up behind it.
 */
export function decayNeeds(needs: Needs, guests: Guests, ticks: number): void {
  if (ticks <= 0) return;
  const hours = ticks / TICKS_PER_HOUR;
  for (let person = 0; person < needs.count; person++) {
    const { decayPerHour } = archetypeOf(guests, person);
    for (const need of NEEDS) {
      const column = needs.level[need];
      // Clamped at 0 from below: a need cannot get worse than desperate, and an
      // unclamped level would let one starving guest's urgency grow without
      // limit and outweigh everything else for ever.
      const dropped = column[person]! - decayPerHour[need] * hours;
      column[person] = dropped < 0 ? 0 : dropped;
    }
  }
}

/**
 * Applies one visit's relief to one person.
 *
 * The **level** is clamped and the amount never is: basketball's `-0.4` energy
 * is the art saying an hour of it is tiring, and clamping the amount away would
 * lose the half of the visit the model was explicit about.
 */
export function relieve(needs: Needs, person: number, satisfies: readonly NeedRelief[]): void {
  for (const relief of satisfies) {
    const column = needs.level[relief.need];
    column[person] = clamp(column[person]! + relief.amount);
  }
}

export interface Urgency {
  readonly need: GuestNeed;
  /** `weight * (1 - level)`: how loud this need is for this person. */
  readonly urgency: number;
}

/**
 * The need pulling hardest on this person, or null while they are content.
 *
 * Weighted rather than simply the lowest level, so a family's hunger beats its
 * boredom at the same level - which is what makes two archetypes behave
 * differently on the same plot rather than merely at different speeds.
 *
 * Ties break towards the earlier entry of {@link NEEDS}, so the answer does not
 * depend on object key order.
 */
export function strongestNeed(needs: Needs, guests: Guests, person: number): Urgency | null {
  const { weight } = archetypeOf(guests, person);
  let strongest: Urgency | null = null;
  for (const need of NEEDS) {
    const urgency = weight[need] * (1 - needs.level[need][person]!);
    if (urgency < CONTENT_URGENCY) continue;
    if (strongest === null || urgency > strongest.urgency) strongest = { need, urgency };
  }
  return strongest;
}
