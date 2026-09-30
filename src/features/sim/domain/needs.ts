import { GUEST_NEEDS, type GuestNeed, type NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { createRandom } from '../../layout/domain/random';
import { archetypeOf } from './archetypes';
import type { NeedsSnapshot } from './resortSnapshot';
import { CLEAR_EFFECT, type WeatherEffect } from './weather';

const TICKS_PER_HOUR = 60;

// Spread so the whole plot does not get hungry at the same minute.
export const START_LEVEL = { min: 0.45, max: 1 } as const;

// Without a floor, everybody always chases their least-met need and nobody sits still.
const CONTENT_URGENCY = 0.2;

// Where an unweighted need stops sending a guest anywhere.
export const SATISFIED_LEVEL = 1 - CONTENT_URGENCY;

export interface Needs {
  readonly count: number;
  // 1 is content and 0 is desperate, so a relief amount adds to it.
  readonly level: { readonly [need in GuestNeed]: Float32Array };
}

const clamp = (level: number): number => (level < 0 ? 0 : level > 1 ? 1 : level);

// Module scope so decayNeeds allocates nothing; safe because it is not re-entrant.
const scratchRate: { [need in GuestNeed]: number } = {
  hunger: 0,
  thirst: 0,
  energy: 0,
  fun: 0,
  hygiene: 0,
  health: 0,
};

// The draw order is load-bearing: changing it reshuffles every seeded scene, which
// breaks benchmark comparisons. resetNeeds draws in the same order.
export function createNeeds(guests: Guests, seed: number): Needs {
  const random = createRandom(seed);
  const span = START_LEVEL.max - START_LEVEL.min;
  const level = {
    hunger: new Float32Array(guests.count),
    thirst: new Float32Array(guests.count),
    energy: new Float32Array(guests.count),
    fun: new Float32Array(guests.count),
    hygiene: new Float32Array(guests.count),
    health: new Float32Array(guests.count).fill(1),
  };
  for (let person = 0; person < guests.count; person++) {
    for (const need of GUEST_NEEDS) level[need][person] = START_LEVEL.min + random() * span;
  }
  return { count: guests.count, level };
}

export function resetNeeds(needs: Needs, person: number, random: () => number): void {
  if (person < 0 || person >= needs.count) return;
  const span = START_LEVEL.max - START_LEVEL.min;
  for (const need of GUEST_NEEDS) needs.level[need][person] = START_LEVEL.min + random() * span;
  needs.level.health[person] = 1;
}

// Takes whole ticks, never a frame delta, so decay does not depend on frame rate.
// Allocates nothing: it runs up to MAX_TICKS_PER_ADVANCE times a frame over every guest.
export function decayNeeds(
  needs: Needs,
  guests: Guests,
  ticks: number,
  effect: WeatherEffect = CLEAR_EFFECT,
  asleep?: (person: number) => boolean,
): void {
  if (ticks <= 0) return;
  const hours = ticks / TICKS_PER_HOUR;
  // Folded into the hours once, not multiplied per person per need: this is the hot loop.
  for (const need of GUEST_NEEDS) scratchRate[need] = effect.decay[need] * hours;
  for (let person = 0; person < needs.count; person++) {
    // A night's decay at these rates empties every need by morning, so a stay would always end
    // on a guest who woke up miserable.
    if (asleep?.(person) === true) continue;
    const { decayPerHour } = archetypeOf(guests, person);
    for (const need of GUEST_NEEDS) {
      const column = needs.level[need];
      // Clamped so one starving guest's urgency cannot grow without limit.
      const dropped = column[person]! - decayPerHour[need] * scratchRate[need];
      column[person] = dropped < 0 ? 0 : dropped;
    }
  }
}

// The level is clamped but the amount never is: a negative amount like basketball's
// energy cost is intentional.
export function relieve(needs: Needs, person: number, satisfies: readonly NeedRelief[]): void {
  for (const relief of satisfies) {
    const column = needs.level[relief.need];
    column[person] = clamp(column[person]! + relief.amount);
  }
}

export function cheer(needs: Needs, person: number, amount: number): void {
  if (person < 0 || person >= needs.count) return;
  needs.level.fun[person] = clamp(needs.level.fun[person]! + amount);
}

// Health after the five, so a tie with a want goes to the want, as it did before health.
const URGENCY_ORDER: readonly GuestNeed[] = [...GUEST_NEEDS, 'health'];

export interface Urgency {
  readonly need: GuestNeed;
  readonly urgency: number;
}

export function strongestNeed(
  needs: Needs,
  guests: Guests,
  person: number,
  effect: WeatherEffect = CLEAR_EFFECT,
): Urgency | null {
  const { weight } = archetypeOf(guests, person);
  let strongest: Urgency | null = null;
  for (const need of URGENCY_ORDER) {
    const urgency = weight[need] * effect.weight[need] * (1 - needs.level[need][person]!);
    if (urgency < CONTENT_URGENCY) continue;
    if (strongest === null || urgency > strongest.urgency) strongest = { need, urgency };
  }
  return strongest;
}

export function snapshotNeeds(needs: Needs): NeedsSnapshot {
  const { hunger, thirst, energy, fun, hygiene, health } = needs.level;
  return {
    hunger: hunger.slice(),
    thirst: thirst.slice(),
    energy: energy.slice(),
    fun: fun.slice(),
    hygiene: hygiene.slice(),
    health: health.slice(),
  };
}

export function restoreNeeds(needs: Needs, snapshot: NeedsSnapshot): void {
  for (const need of GUEST_NEEDS) needs.level[need].set(snapshot[need]);
  needs.level.health.set(snapshot.health);
}
