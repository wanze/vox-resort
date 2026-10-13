import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../../sim/domain/weather';
import { DOWNWIND, DOWNWIND_YAW, FLAG_COLORS, flagFor } from './beachFlags';
import { createRaindrops, dropAt, rainfallFor } from './rainfall';

describe('flagFor', () => {
  it('flies red in a storm, yellow in the rain and green otherwise', () => {
    expect(flagFor('storm')).toBe('danger');
    expect(flagFor('rain')).toBe('caution');
    expect(flagFor('clear')).toBe('calm');
    expect(flagFor('heatwave')).toBe('calm');
  });

  it('flies a different colour for each signal', () => {
    const colours = new Set(WEATHERS.map((weather) => FLAG_COLORS[flagFor(weather)]));
    expect(colours.size).toBe(3);
  });
});

describe('DOWNWIND', () => {
  it('blows the way the rain drifts as it falls', () => {
    const view = { voxelsPerPixel: 0.5, width: 1000, height: 800, rise: 1, distance: 1.4 };
    const look = rainfallFor('storm', view)!;
    const drops = createRaindrops(1, 3);
    const centre = { x: 0, y: 0, z: 0 };
    const from = dropAt(drops, 0, 0, look, centre);
    const later = dropAt(drops, 0, 0.05, look, centre);
    const drift = { x: later.x - from.x, z: later.z - from.z };
    expect(drift.x * DOWNWIND.x + drift.z * DOWNWIND.z).toBeGreaterThan(0);
  });

  it('turns a cloth along +x to point downwind', () => {
    expect(Math.cos(DOWNWIND_YAW)).toBeCloseTo(DOWNWIND.x);
    expect(-Math.sin(DOWNWIND_YAW)).toBeCloseTo(DOWNWIND.z);
  });
});
