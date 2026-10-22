import { TICKS_PER_DAY } from './simClock';
import type { WeatherEffect } from './weather';

const TICKS_PER_HOUR = TICKS_PER_DAY / 24;

interface Meal {
  readonly from: number;
  readonly to: number;
}

const mealOf = (from: number, to: number): Meal => ({
  from: from * TICKS_PER_HOUR,
  to: to * TICKS_PER_HOUR,
});

const MEALS: readonly Meal[] = [mealOf(7.5, 9.5), mealOf(12, 14), mealOf(18.5, 20.5)];

// Only the weight moves, never the decay, so guests eat as much a day as before but together:
// spread over the whole day, no restaurant ever filled.
export const MEAL_PULL = 2;
export const BETWEEN_MEALS = 0.5;

export function atMealtime(tickOfDay: number): boolean {
  const tick = ((tickOfDay % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return MEALS.some((meal) => tick >= meal.from && tick < meal.to);
}

const withHunger = (effect: WeatherEffect, pull: number): WeatherEffect => ({
  ...effect,
  weight: { ...effect.weight, hunger: effect.weight.hunger * pull },
});

// The weather effects are a handful of constants, so each is dressed for the table only once.
const dressed = new WeakMap<WeatherEffect, readonly [WeatherEffect, WeatherEffect]>();

export function appetiteAt(effect: WeatherEffect, tickOfDay: number): WeatherEffect {
  let pair = dressed.get(effect);
  if (!pair) {
    pair = [withHunger(effect, MEAL_PULL), withHunger(effect, BETWEEN_MEALS)];
    dressed.set(effect, pair);
  }
  return atMealtime(tickOfDay) ? pair[0] : pair[1];
}
