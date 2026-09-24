import { describe, expect, it } from 'vitest';
import { percentile, roundStats, summarizeFrames } from './frameStats';

describe('percentile', () => {
  it('has no percentile for an empty sample', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('returns the only value of a one-frame sample', () => {
    expect(percentile([12], 0.99)).toBe(12);
  });

  it('takes the ends at 0 and 1', () => {
    const sorted = [1, 2, 3, 4];
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 1)).toBe(4);
  });

  it('interpolates between neighbours', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });

  it('clamps a quantile outside 0..1', () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 5)).toBe(3);
  });
});

describe('summarizeFrames', () => {
  it('reports zeroes for an empty run', () => {
    const stats = summarizeFrames([]);
    expect(stats.frames).toBe(0);
    expect(stats.fps).toBe(0);
    expect(stats.medianFps).toBe(0);
  });

  it('reads a steady 60 fps stream as 60 fps', () => {
    const stats = summarizeFrames(Array.from({ length: 100 }, () => 1000 / 60));
    expect(stats.fps).toBeCloseTo(60, 6);
    expect(stats.medianFps).toBeCloseTo(60, 6);
    expect(stats.p99Ms).toBeCloseTo(1000 / 60, 6);
  });

  it('separates the average from the tail on a spiky stream', () => {
    const durations = Array.from({ length: 100 }, (_, index) =>
      index % 2 === 0 ? 1000 / 120 : 1000 / 30,
    );
    const stats = summarizeFrames(durations);
    expect(stats.minMs).toBeCloseTo(1000 / 120, 6);
    expect(stats.maxMs).toBeCloseTo(1000 / 30, 6);
    expect(stats.p95Ms).toBeGreaterThan(stats.medianMs);
  });

  it('drops frames with a broken duration', () => {
    const stats = summarizeFrames([16, Number.NaN, -4, 0, Number.POSITIVE_INFINITY, 16]);
    expect(stats.frames).toBe(2);
    expect(stats.fps).toBeCloseTo(62.5, 6);
  });

  it('counts fps over the measured span, not over the median', () => {
    const stats = summarizeFrames([...Array.from({ length: 9 }, () => 10), 910]);
    expect(stats.medianMs).toBe(10);
    expect(stats.fps).toBeCloseTo(10, 6);
  });
});

describe('roundStats', () => {
  it('rounds to the precision a report prints', () => {
    const stats = roundStats(summarizeFrames(Array.from({ length: 10 }, () => 1000 / 60)));
    expect(stats.fps).toBe(60);
    expect(stats.medianMs).toBe(16.67);
  });
});
