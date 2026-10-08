import { mix, unitOf } from '../../random/domain/hash';
import type { Needs } from './needs';

// Low enough that a hurt guest's urgency, 3 x 0.65, beats any want at its worst.
export const HURT_LEVEL = 0.35;

// A sunbather stays an hour or two, so this burns about one in twenty of a heatwave's sunbathers,
// three on the reference plot: enough to see, not a massacre.
export const SUNBURN_PER_HOUR = 0.04;

// Per swim. A lifeguard cuts mishaps tenfold, which is what makes one worth hiring.
export const MISHAP_UNWATCHED = 0.02;
export const MISHAP_WATCHED = 0.002;

const GOLDEN = 2_654_435_761;

// Hashed rather than drawn from a stream, so an incident moves no other seeded draw. The low bit
// keeps a sunburn's draw and a mishap's apart for the same person and number.
const drawFor = (person: number, when: number, kind: 0 | 1): number =>
  unitOf(mix(Math.imul(person + 1, GOLDEN) + when * 2 + kind));

export function sunburnt(
  person: number,
  hour: number,
  heatwave: boolean,
  sunbathing: boolean,
): boolean {
  return heatwave && sunbathing && drawFor(person, hour, 0) < SUNBURN_PER_HOUR;
}

export function mishap(person: number, tick: number, watched: boolean): boolean {
  return drawFor(person, tick, 1) < (watched ? MISHAP_WATCHED : MISHAP_UNWATCHED);
}

export function hurt(needs: Needs, person: number): void {
  const health = needs.level.health;
  if (person < 0 || person >= health.length) return;
  health[person] = Math.min(health[person]!, HURT_LEVEL);
}

// Once a simulated hour. Somebody already hurt is left alone, so one burn is one thought.
export function burnTheSunbathers(
  needs: Needs,
  present: Uint8Array,
  sunbathing: (person: number) => boolean,
  hour: number,
  onHurt: (person: number) => void,
): void {
  const health = needs.level.health;
  for (let person = 0; person < present.length; person++) {
    if (present[person] !== 1 || health[person]! <= HURT_LEVEL) continue;
    if (!sunbathing(person) || !sunburnt(person, hour, true, true)) continue;
    hurt(needs, person);
    onHurt(person);
  }
}
