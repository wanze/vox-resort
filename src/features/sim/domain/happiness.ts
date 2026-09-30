import { GUEST_NEEDS } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import type { Needs } from './needs';
import type { HappinessSnapshot } from './resortSnapshot';

const TICKS_PER_HOUR = 60;

// Slow on purpose, so the rating reflects how the resort is built rather than the
// last ten minutes.
export const DRIFT_PER_HOUR = 0.15;

// Twice the drift: queueing is the one hardship no need column records.
export const QUEUE_COST_PER_HOUR = 0.3;

// Not named START_LEVEL: two same-named exports in one folder collide through a barrel.
// Not 1, or a resort could only ever make people less happy than they arrived.
export const ARRIVAL_MOOD = 0.7;

// Small against the needs, or a player could make up for no restaurant with flowerbeds.
export const SURROUNDINGS_SHARE = 0.1;

// A hurt guest is at best half as content as their wants say: a plaster does not make up for the
// fall, but a full stomach still counts for something.
export const HURT_FLOOR = 0.5;

export interface Happiness {
  readonly count: number;
  readonly level: Float32Array;
}

const clamp = (level: number): number => (level < 0 ? 0 : level > 1 ? 1 : level);

export function createHappiness(count: number): Happiness {
  const people = Math.max(0, Math.floor(count));
  return { count: people, level: new Float32Array(people).fill(ARRIVAL_MOOD) };
}

// Unweighted on purpose: archetype weights decide where a guest walks, not whether
// they enjoy their stay. Health scales the wants rather than joining them.
function contentmentOf(needs: Needs, person: number): number {
  let total = 0;
  for (const need of GUEST_NEEDS) total += needs.level[need][person]!;
  const wants = total / GUEST_NEEDS.length;
  const health = needs.level.health[person]!;
  return health >= 1 ? wants : wants * (HURT_FLOOR + (1 - HURT_FLOOR) * health);
}

// Allocates nothing: it runs up to MAX_TICKS_PER_ADVANCE times a frame. Absent people
// are skipped, since their slot holds the previous guest's mood until check-in.
// Surroundings are signed, -1 to 1; omit them and every place is neutral.
export function ageHappiness(
  happiness: Happiness,
  needs: Needs,
  guests: Guests,
  waiting: (person: number) => boolean,
  ticks: number,
  surroundings?: (person: number) => number,
): void {
  if (ticks <= 0) return;
  const hours = ticks / TICKS_PER_HOUR;
  const drift = DRIFT_PER_HOUR * hours;
  const queued = QUEUE_COST_PER_HOUR * hours;
  for (let person = 0; person < happiness.count; person++) {
    if (guests.present[person] !== 1) continue;
    const level = happiness.level[person]!;
    const around = surroundings ? SURROUNDINGS_SHARE * surroundings(person) : 0;
    const towards = clamp(contentmentOf(needs, person) + around) - level;
    // Never past the target, so a long run of ticks settles instead of overshooting.
    const moved = towards < 0 ? Math.max(towards, -drift) : Math.min(towards, drift);
    happiness.level[person] = clamp(level + moved - (waiting(person) ? queued : 0));
  }
}

// Null rather than 0: an empty resort has not made anybody unhappy.
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

export function snapshotHappiness(happiness: Happiness): HappinessSnapshot {
  return { level: happiness.level.slice() };
}

export function restoreHappiness(happiness: Happiness, snapshot: HappinessSnapshot): void {
  happiness.level.set(snapshot.level);
}
