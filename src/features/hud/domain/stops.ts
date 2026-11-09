import { weekdayOf } from '../../events/domain/week';
import type { SimSpeed } from '../../sim/domain/simClock';

// 'planning' holds the pause while the Programme window the poster opened is still up.
export type Stop =
  | { readonly kind: 'week'; readonly key: string; readonly day: number }
  | { readonly kind: 'planning'; readonly key: string }
  | { readonly kind: 'offer'; readonly key: string; readonly offer: number };

export interface Stops {
  readonly waiting: readonly Stop[];
  // The speed the first stop interrupted; null when it found the game already paused.
  readonly resume: SimSpeed | null;
}

export const NO_STOPS: Stops = { waiting: [], resume: null };

export const PLANNING: Stop = { kind: 'planning', key: 'planning' };

export const weekStop = (day: number): Stop => ({ kind: 'week', key: `week:${day}`, day });

export const offerStop = (offer: number): Stop => ({ kind: 'offer', key: `offer:${offer}`, offer });

// The speed is remembered only by the first stop, so a second one queued behind it never
// remembers the pause the first one made.
export function stop(stops: Stops, added: readonly Stop[], speed: SimSpeed): Stops {
  const keys = new Set(stops.waiting.map((each) => each.key));
  const fresh = added.filter((each) => !keys.has(each.key));
  if (fresh.length === 0) return stops;
  const resume = stops.waiting.length > 0 ? stops.resume : speed === 'paused' ? null : speed;
  return { waiting: [...stops.waiting, ...fresh], resume };
}

// The speed comes back only with the last stop answered, never while another still waits.
export function answer(
  stops: Stops,
  key: string,
): { readonly stops: Stops; readonly resume: SimSpeed | null } {
  const waiting = stops.waiting.filter((each) => each.key !== key);
  if (waiting.length === stops.waiting.length) return { stops, resume: null };
  if (waiting.length > 0) return { stops: { ...stops, waiting }, resume: null };
  return { stops: NO_STOPS, resume: stops.resume };
}

// What the player sees: the planning hold has nothing to show.
export const shownStop = (stops: Stops): Stop | null =>
  stops.waiting.find((each) => each.kind !== 'planning') ?? null;

export interface PausePrefs {
  readonly pauseWeek: boolean;
  readonly pauseOffers: boolean;
}

export interface MorningFacts {
  readonly day: number;
  // Somewhere to put an event on, so the week's poster has something to say.
  readonly stage: boolean;
}

export const morningStops = (facts: MorningFacts, prefs: PausePrefs): readonly Stop[] =>
  prefs.pauseWeek && facts.stage && weekdayOf(facts.day) === 0 ? [weekStop(facts.day)] : [];
