/**
 * What kind of day it is, and what that does to everybody on the plot.
 *
 * ## Nothing about the weather is stored
 *
 * The day's weather is worked out from the day number and the plot's seed with
 * an integer hash, every time it is asked for, exactly as `night.ts` works out
 * a party's bedtime. A save file holds nothing about it, nothing has to be
 * advanced in lockstep with the clock, and two runs of the same plot get the
 * same week. `simClock.ts`'s "one integer of state" stays true.
 *
 * ## One kind of weather per day, not per hour
 *
 * A storm that arrives at two and clears at four is a storm nobody notices on a
 * plot whose day takes five real minutes; a day that is a storm is a day the
 * player plans around - and a reason to build a covered thing as well as an
 * open one.
 *
 * ## It multiplies the tuning surface, it does not join it
 *
 * `archetypes.ts` is where anybody who says the resort feels wrong is pointed
 * first. Weather is not a fact about a party, so it is never a row in that
 * table: it is a multiplier laid over whatever the party's own numbers are, and
 * the two stay separable or nobody will ever be able to tune either. Every
 * multiplier here is inside {@link MAX_EFFECT}'s bounds for the same reason -
 * outside them the weather would *be* the tuning surface.
 *
 * ## What it is deliberately not
 *
 * There is no rain drawn on the screen. Weather here is four things: the need
 * weights, the decay rates, whether a venue is open, and one number the sky is
 * greyed by (`lighting/domain/dayNight.ts`'s `overcastSky`). Drawn
 * precipitation is a rendering plan of its own; see `plans/023-weather.md`.
 */

import type { GuestNeed } from '../../../../voxel-gen/voxelgen.ts';
import type { Shelter } from '../../../../voxel-gen/voxelgen.ts';
import { mix } from './night';

/**
 * The kinds of day the resort gets.
 *
 * Four rather than a scale, because a player plans around a named day and not
 * around a cloud fraction: "it is going to storm" is a decision to build a
 * games hall, and "0.62 overcast" is a number.
 */
export type Weather = 'clear' | 'rain' | 'storm' | 'heatwave';

/** Every kind, in the order the table below declares them. */
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'storm', 'heatwave'];

/** A multiplier per need, which is how every weather effect is expressed. */
type PerNeed = { readonly [need in GuestNeed]: number };

export interface WeatherEffect {
  /** How loudly each need is felt today, against the archetype's own weight. */
  readonly weight: PerNeed;
  /** How fast each need runs down today, against the archetype's own rate. */
  readonly decay: PerNeed;
  /** What a venue must be to stay open today; see `venues.ts`'s `shelterOf`. */
  readonly closes: Shelter | null;
  /** How grey the sky is, 0..1, for `overcastSky`. */
  readonly overcast: number;
}

/**
 * The widest any multiplier in {@link WEATHER_EFFECTS} may be.
 *
 * Half to double. Beyond it a day's weather would outweigh the difference
 * between a family and a group of friends, and the archetype table would stop
 * being what the resort is tuned by. `weather.test.ts` holds the table to it,
 * so a number typed outside the bounds fails rather than quietly becoming the
 * tuning surface.
 */
export const MAX_EFFECT = { min: 0.5, max: 2 } as const;

const NO_CHANGE: PerNeed = { hunger: 1, thirst: 1, energy: 1, fun: 1, hygiene: 1 };

/**
 * What each kind of day does, with the argument beside each row as `ARCHETYPES`
 * has it.
 *
 * The weights say what people *want* and the decays say how fast they come to
 * want it; a day that moved only one of the two would be a day where everybody
 * got thirsty and nobody went for a drink, or went for a drink they did not
 * want. Both, or neither.
 */
const WEATHER_EFFECTS: { readonly [kind in Weather]: WeatherEffect } = {
  /**
   * An ordinary day, and **most days are this** - see {@link CLEAR_IN}. All
   * ones, nothing closed and a sky that is handed back untouched, which is why
   * a caller that knows nothing about weather behaves exactly as it did before
   * there was any.
   */
  clear: { weight: NO_CHANGE, decay: NO_CHANGE, closes: null, overcast: 0 },
  /**
   * Nothing to do outside. Fun is felt harder because the open half of the plot
   * has shut, and hygiene less because nobody is sweating - which together send
   * the resort indoors rather than merely stopping it going out.
   *
   * Not grey to the point of gloom: half way, so the plot still reads.
   */
  rain: {
    weight: { ...NO_CHANGE, fun: 1.2, hygiene: 0.8 },
    decay: NO_CHANGE,
    closes: 'open',
    overcast: 0.55,
  },
  /**
   * Rain, harder, and long enough to be tiring: the sky goes nearly to slate
   * and energy runs down faster than on any other day. The same closure as
   * rain, because a roof is a roof - what a storm changes is how much of the
   * day is spent under it.
   */
  storm: {
    weight: { ...NO_CHANGE, fun: 1.2, hygiene: 0.8 },
    decay: { ...NO_CHANGE, energy: 1.2 },
    closes: 'open',
    overcast: 0.85,
  },
  /**
   * Thirst, and thirst felt sooner than it is normally felt at all: the decay
   * runs ahead of the weight so that a guest is already parched by the time the
   * weight decides where they go. Tiring as well, mildly.
   *
   * **Nothing closes and the sky stays clear** - a heatwave is not grey, and it
   * is the day the pool and the beach are worth having. `chooseVenue` needs no
   * help doing that: it already prefers what relieves the loudest need.
   */
  heatwave: {
    weight: { ...NO_CHANGE, thirst: 1.6 },
    decay: { ...NO_CHANGE, thirst: 1.8, energy: 1.3 },
    closes: null,
    overcast: 0,
  },
};

/** The effect of an ordinary day: all ones, nothing closed, nothing grey. */
export const CLEAR_EFFECT = WEATHER_EFFECTS.clear;

/**
 * How the week is drawn, as slices of {@link DRAW_RANGE}.
 *
 * **Clear is about two days in three**, because weather that happens every day
 * is not an event and a plot where the beach is shut half the week is a plot
 * nobody builds a beach on. Rain is the common bad day, a storm is the rare
 * one, and a heatwave falls between them.
 */
const DRAW_RANGE = 24;
const CLEAR_IN = 16;
const RAIN_IN = 4;
const HEATWAVE_IN = 2;

/**
 * What the weather is on this day of this resort.
 *
 * Hashed rather than taken modulo, for `night.ts`'s reason: day numbers run
 * consecutively, and a raw modulo would give a week that ran clear, rain,
 * storm, heatwave, clear, rain in lockstep for ever. `mix` is imported rather
 * than copied so there is one hash in `sim/domain/` and not two.
 *
 * A negative day - which nothing produces, but the clock's arithmetic could -
 * hashes as happily as any other, so there is no guard.
 */
export function weatherOn(day: number, seed: number): Weather {
  const draw = mix(Math.trunc(day) * 2_654_435_761 + seed) % DRAW_RANGE;
  if (draw < CLEAR_IN) return 'clear';
  if (draw < CLEAR_IN + RAIN_IN) return 'rain';
  if (draw < CLEAR_IN + RAIN_IN + HEATWAVE_IN) return 'heatwave';
  return 'storm';
}

/**
 * How much each need is felt and lost in this weather: a multiplier on the
 * archetype's own numbers, never a replacement for them.
 *
 * `1` everywhere is `clear`, which is why a caller that knows nothing about
 * weather behaves exactly as it did before there was any.
 */
export function weatherEffect(weather: Weather): WeatherEffect {
  return WEATHER_EFFECTS[weather];
}

/**
 * Whether a venue with this much shelter is open in this weather.
 *
 * One predicate rather than a comparison written out at each reader, because
 * there are three of them - `chooseVenue`'s candidate test, the router's door,
 * and the cleaner who must not be sent to a shut building - and they must agree.
 */
export function isOpenIn(shelter: Shelter, effect: WeatherEffect): boolean {
  return effect.closes === null || shelter !== effect.closes;
}
