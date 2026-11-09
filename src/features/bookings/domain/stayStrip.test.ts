import { describe, expect, it } from 'vitest';
import { leavesOn, stayStrip } from './stayStrip';

const offer = { arrivesOn: 8, nights: 3 };

describe('stayStrip', () => {
  it('runs from today to the morning the group leaves', () => {
    const strip = stayStrip(offer, 5);
    expect(strip.map((each) => each.day)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(strip.map((each) => each.role)).toEqual([
      'wait',
      'wait',
      'wait',
      'arrive',
      'stay',
      'stay',
      'stay',
      'leave',
    ]);
  });

  it('marks today', () => {
    const strip = stayStrip(offer, 4);
    expect(strip.filter((each) => each.today).map((each) => each.day)).toEqual([4]);
  });

  it('names each day as the player counts it', () => {
    const [first] = stayStrip(offer, 0);
    expect(first).toMatchObject({ weekday: 'Mon', date: 1 });
  });

  it('starts at the arrival for a group already here', () => {
    expect(stayStrip(offer, 10)[0]!.day).toBe(8);
  });
});

describe('leavesOn', () => {
  it('is the morning after the last night', () => {
    expect(leavesOn(offer)).toBe(12);
  });
});
