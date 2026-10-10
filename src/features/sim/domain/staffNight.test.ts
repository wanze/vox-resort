import { describe, expect, it } from 'vitest';
import {
  EVENING_ENDS_FROM,
  type Evening,
  finishesFirst,
  isStaffNight,
  offForTheNight,
  onShiftOf,
  STAFF_BACK_AT,
} from './staffNight';

const HOUR = 60;

const quiet = (tickOfDay: number): Evening => ({
  tickOfDay,
  eventOn: false,
  lateOpen: false,
  swimmers: 0,
});

describe('isStaffNight', () => {
  it('runs from ten at night to five in the morning', () => {
    expect(isStaffNight(EVENING_ENDS_FROM - 1)).toBe(false);
    expect(isStaffNight(EVENING_ENDS_FROM)).toBe(true);
    expect(isStaffNight(2 * HOUR)).toBe(true);
    expect(isStaffNight(STAFF_BACK_AT - 1)).toBe(true);
    expect(isStaffNight(STAFF_BACK_AT)).toBe(false);
    expect(isStaffNight(12 * HOUR)).toBe(false);
  });

  it('reads any day, not only the first', () => {
    expect(isStaffNight(3 * 1440 + 23 * HOUR)).toBe(true);
  });
});

describe('offForTheNight', () => {
  it('keeps everybody through the day, however quiet', () => {
    for (const role of ['cleaner', 'lifeguard', 'animator', 'mechanic'] as const) {
      expect(offForTheNight(role, quiet(20 * HOUR))).toBe(false);
      expect(offForTheNight(role, quiet(STAFF_BACK_AT))).toBe(false);
    }
  });

  it('sends everybody home on a quiet night', () => {
    for (const role of ['cleaner', 'lifeguard', 'animator', 'mechanic'] as const) {
      expect(offForTheNight(role, quiet(23 * HOUR))).toBe(true);
    }
  });

  it('keeps the crew while the club is open or an event is on or due', () => {
    const club = { ...quiet(HOUR), lateOpen: true };
    const show = { ...quiet(22 * HOUR), eventOn: true };
    for (const role of ['cleaner', 'animator', 'mechanic'] as const) {
      expect(offForTheNight(role, club)).toBe(false);
      expect(offForTheNight(role, show)).toBe(false);
    }
  });

  it('lets a lifeguard go once the water is empty, whatever else is open', () => {
    const late = { ...quiet(23 * HOUR), lateOpen: true, eventOn: true };
    expect(offForTheNight('lifeguard', late)).toBe(true);
    expect(offForTheNight('lifeguard', { ...late, swimmers: 2 })).toBe(false);
  });
});

describe('finishesFirst', () => {
  it('lets the trades finish a spell and cuts a show or a watch', () => {
    expect(finishesFirst('cleaner')).toBe(true);
    expect(finishesFirst('mechanic')).toBe(true);
    expect(finishesFirst('animator')).toBe(false);
    expect(finishesFirst('lifeguard')).toBe(false);
  });
});

describe('onShiftOf', () => {
  it('is the duty less anybody off for the night', () => {
    const duty = Uint8Array.of(1, 1, 0, 1);
    const off = Uint8Array.of(0, 1, 1, 0);
    expect([...onShiftOf(duty, off)]).toEqual([1, 0, 0, 1]);
  });

  it('leaves the duty untouched', () => {
    const duty = Uint8Array.of(1, 1);
    onShiftOf(duty, Uint8Array.of(1, 1));
    expect([...duty]).toEqual([1, 1]);
  });
});
