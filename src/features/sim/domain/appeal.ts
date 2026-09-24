import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Guests } from '../../guests/domain/guests';
import { archetypeOf } from './archetypes';
import { WALK_VOXELS_PER_SIM_HOUR } from './crowdRate';
import { NEEDS, type Needs } from './needs';
import type { Venue } from './venues';
import { CLEAR_EFFECT, type WeatherEffect } from './weather';

// A level is clamped at 1, so only the relief a guest has room for counts: crediting
// the full amount made the biggest declared number win every choice.
export function usableGain(amount: number, level: number): number {
  return amount >= 0 ? Math.min(amount, 1 - level) : -Math.min(-amount, level);
}

// Scored for the level on arrival, since a long walk deepens the need. Clamped at 0 as
// decayNeeds does, or a walk across the plot would look like unlimited room for relief.
function levelOnArrival(level: number, decayPerHour: number, hours: number): number {
  // A fully met need is not anticipated: the walk deepens a need, it does not invent one,
  // and a declared cost keeps costing full price.
  if (level >= 1) return 1;
  const dropped = level - decayPerHour * hours;
  return dropped < 0 ? 0 : dropped;
}

export function appealOf(
  venue: Venue,
  needs: Needs,
  guests: Guests,
  person: number,
  distance = 0,
  effect: WeatherEffect = CLEAR_EFFECT,
): number {
  const { weight, decayPerHour } = archetypeOf(guests, person);
  const hours = distance / WALK_VOXELS_PER_SIM_HOUR;
  let gain = 0;
  for (const relief of venue.satisfies) {
    const level = levelOnArrival(
      needs.level[relief.need][person]!,
      decayPerHour[relief.need],
      hours,
    );
    gain += weight[relief.need] * effect.weight[relief.need] * usableGain(relief.amount, level);
  }
  return gain;
}

// Ties break in NEEDS order, independent of the order a model lists its reliefs.
export function dominantNeedAt(
  venue: Venue,
  needs: Needs,
  guests: Guests,
  person: number,
  distance = 0,
  effect: WeatherEffect = CLEAR_EFFECT,
): GuestNeed | null {
  const { weight, decayPerHour } = archetypeOf(guests, person);
  const hours = distance / WALK_VOXELS_PER_SIM_HOUR;
  let best: GuestNeed | null = null;
  let most = 0;
  for (const relief of venue.satisfies) {
    const level = levelOnArrival(
      needs.level[relief.need][person]!,
      decayPerHour[relief.need],
      hours,
    );
    const gain =
      weight[relief.need] * effect.weight[relief.need] * usableGain(relief.amount, level);
    if (gain <= 0) continue;
    const louder =
      best === null ||
      gain > most ||
      (gain === most && NEEDS.indexOf(relief.need) < NEEDS.indexOf(best));
    if (!louder) continue;
    most = gain;
    best = relief.need;
  }
  return best;
}

// Keyed on the venue key, never its index: the index changes whenever anything is built.
export function saltFor(key: string): number {
  let hash = 2166136261;
  for (let at = 0; at < key.length; at++) hash = Math.imul(hash ^ key.charCodeAt(at), 16777619);
  return hash | 0;
}

// A fixed taste per pair rather than a random draw, so benchmark replays stay comparable
// and the inspector can explain a choice.
export function tasteFor(salt: number, person: number, spread: number): number {
  let mixed = Math.imul(salt ^ (person + 0x9e3779b9), 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return 1 - spread / 2 + spread * ((mixed >>> 8) / 0x01000000);
}
