import { describe, expect, it } from 'vitest';
import { staffFor, STAFF_ROLES } from './staff';

describe('staffFor', () => {
  it('puts nobody on a plot with nothing to clean', () => {
    const staff = staffFor(0);
    expect(staff.count).toBe(0);
    expect(staff.role).toEqual([]);
    expect(staff.variant).toHaveLength(0);
  });

  it('follows the venue count, and never leaves a plot with venues unstaffed', () => {
    const counts = [1, 3, 6, 12, 30, 60].map((venues) => staffFor(venues).count);
    expect(counts).toEqual([...counts].toSorted((a, b) => a - b));
    expect(staffFor(1).count).toBe(1);
    expect(staffFor(6).count).toBe(1);
    expect(staffFor(30).count).toBeGreaterThan(staffFor(6).count);
  });

  it('caps the count so a tiled bench plot does not put a town on screen', () => {
    const huge = staffFor(5000);
    expect(huge.count).toBeLessThan(100);
    expect(huge.count).toBe(staffFor(50_000).count);
    expect(huge.variant).toHaveLength(huge.count);
  });

  it('draws every one of them with a model the art declares', () => {
    const staff = staffFor(30);
    for (let worker = 0; worker < staff.count; worker++) {
      expect(staff.role[worker]).toBe('cleaner');
      expect(staff.variant[worker]).toBe(STAFF_ROLES.indexOf('cleaner'));
      expect(staff.variant[worker]).toBeGreaterThanOrEqual(0);
    }
  });
});
