import { describe, expect, it } from 'vitest';
import { furledShareAt } from './canopyFurl';

const at = (hours: number): number => furledShareAt(hours / 24);

describe('furledShareAt', () => {
  it('keeps every parasol open through the day', () => {
    for (const hours of [9, 12, 15, 18, 18.5]) expect(at(hours), `${hours}h`).toBeCloseTo(0);
  });

  it('furls them one after another in the evening light, before sunset', () => {
    expect(at(19.25)).toBeCloseTo(0.5);
    expect(at(19)).toBeLessThan(at(19.5));
    expect(at(20)).toBe(1);
  });

  it('keeps every parasol furled through the night', () => {
    for (const hours of [20, 22, 0, 3, 7.5]) expect(at(hours), `${hours}h`).toBeCloseTo(1);
  });

  it('opens them again through the morning', () => {
    expect(at(8.25)).toBeCloseTo(0.5);
    expect(at(8)).toBeGreaterThan(at(8.5));
  });

  it('reads a time past midnight as the next day', () => {
    expect(furledShareAt(1 + 12 / 24)).toBe(0);
    expect(furledShareAt(-1 / 24)).toBe(1);
  });
});
