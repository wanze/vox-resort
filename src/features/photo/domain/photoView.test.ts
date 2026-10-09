import { describe, expect, it } from 'vitest';
import { clampFov, focalLength, PHOTO_FOV, snapLookTime, timeLabel } from './photoView';

const at = (hours: number, minutes = 0): number => (hours + minutes / 60) / 24;

describe('clampFov', () => {
  it('keeps a lens inside the range', () => {
    expect(clampFov(5)).toBe(PHOTO_FOV.min);
    expect(clampFov(500)).toBe(PHOTO_FOV.max);
    expect(clampFov(55)).toBe(55);
  });
});

describe('focalLength', () => {
  it('names the lens as on a 35 mm camera, wide at a wide view', () => {
    expect(focalLength(90)).toBe(12);
    expect(focalLength(60)).toBe(21);
    expect(focalLength(20)).toBe(68);
  });

  it('names only lenses the slider offers', () => {
    expect(focalLength(5)).toBe(focalLength(PHOTO_FOV.min));
  });
});

describe('snapLookTime', () => {
  it('snaps to five minutes', () => {
    expect(snapLookTime(at(21, 13))).toBeCloseTo(at(21, 15), 9);
    expect(snapLookTime(at(21, 12))).toBeCloseTo(at(21, 10), 9);
  });

  it('wraps 23:58 round to midnight', () => {
    expect(snapLookTime(at(23, 58))).toBe(0);
    expect(snapLookTime(1.25)).toBeCloseTo(0.25, 9);
  });
});

describe('timeLabel', () => {
  it('writes the hour and minute', () => {
    expect(timeLabel(at(21, 15))).toBe('21:15');
    expect(timeLabel(0)).toBe('00:00');
    expect(timeLabel(at(9, 3))).toBe('09:05');
  });
});
