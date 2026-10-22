import { describe, expect, it } from 'vitest';
import { appetiteAt, atMealtime, BETWEEN_MEALS, MEAL_PULL } from './mealtimes';
import { TICKS_PER_DAY } from './simClock';
import { CLEAR_EFFECT, weatherEffect } from './weather';

const at = (hours: number): number => (hours * TICKS_PER_DAY) / 24;

describe('atMealtime', () => {
  it('is true at breakfast, lunch and dinner and false between them', () => {
    expect(atMealtime(at(8))).toBe(true);
    expect(atMealtime(at(12.5))).toBe(true);
    expect(atMealtime(at(19))).toBe(true);
    expect(atMealtime(at(10))).toBe(false);
    expect(atMealtime(at(16))).toBe(false);
    expect(atMealtime(at(23))).toBe(false);
  });

  it('ends a meal on its last minute', () => {
    expect(atMealtime(at(14) - 1)).toBe(true);
    expect(atMealtime(at(14))).toBe(false);
  });

  it('reads a tick from another day as the same hour', () => {
    expect(atMealtime(at(12.5) + 3 * TICKS_PER_DAY)).toBe(true);
  });
});

describe('appetiteAt', () => {
  it('pulls hunger up at a meal and down between them, leaving the rest alone', () => {
    const lunch = appetiteAt(CLEAR_EFFECT, at(13));
    const afternoon = appetiteAt(CLEAR_EFFECT, at(16));
    expect(lunch.weight.hunger).toBe(MEAL_PULL);
    expect(afternoon.weight.hunger).toBe(BETWEEN_MEALS);
    expect(lunch.weight.thirst).toBe(CLEAR_EFFECT.weight.thirst);
    expect(lunch.decay).toBe(CLEAR_EFFECT.decay);
  });

  it('keeps the weather', () => {
    const heat = weatherEffect('heatwave');
    const lunch = appetiteAt(heat, at(13));
    expect(lunch.weight.thirst).toBe(heat.weight.thirst);
    expect(lunch.cooling).toBe(heat.cooling);
  });

  it('hands back the same object for the same weather and meal', () => {
    expect(appetiteAt(CLEAR_EFFECT, at(12))).toBe(appetiteAt(CLEAR_EFFECT, at(13)));
  });
});
