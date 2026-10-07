import { describe, expect, it } from 'vitest';
import { summarizeTimings, type TimingEntry } from './timings';

const entry = (name: string, startTime: number, duration: number, detail?: unknown): TimingEntry =>
  detail === undefined ? { name, startTime, duration } : { name, startTime, duration, detail };

describe('summarizeTimings', () => {
  it('summarises nothing when nothing was measured', () => {
    expect(summarizeTimings([], 0)).toEqual({});
  });

  it("ignores measures that are not the game's", () => {
    expect(summarizeTimings([entry('react:render', 10, 5)], 0)).toEqual({});
  });

  it('drops per-frame measures from warmup but keeps the boot ones', () => {
    const summary = summarizeTimings(
      [entry('vox:frame:sim', 5, 1), entry('vox:boot:scratch', 5, 40)],
      100,
    );
    expect(summary).not.toHaveProperty('vox:frame:sim');
    expect(summary['vox:boot:scratch']?.count).toBe(1);
  });

  it('counts, totals and ranks the durations of each name', () => {
    const durations = [4, 1, 3, 2, 5];
    const summary = summarizeTimings(
      durations.map((duration, index) => entry('vox:frame:crowd', 100 + index, duration)),
      100,
    );
    expect(summary['vox:frame:crowd']).toEqual({
      count: 5,
      totalMs: 15,
      medianMs: 3,
      p95Ms: 4.8,
      maxMs: 5,
      detailTotal: 0,
    });
  });

  it('counts a measure that took no time', () => {
    const summary = summarizeTimings(
      [entry('vox:frame:crowd', 0, 0), entry('vox:frame:crowd', 1, 2)],
      0,
    );
    expect(summary['vox:frame:crowd']?.count).toBe(2);
    expect(summary['vox:frame:crowd']?.medianMs).toBe(1);
  });

  it('rounds to hundredths of a millisecond', () => {
    expect(summarizeTimings([entry('vox:retile', 0, 1.23456)], 0)['vox:retile']?.maxMs).toBe(1.23);
  });

  it('sums numeric details only, so a run can say ms per tick', () => {
    const summary = summarizeTimings(
      [
        entry('vox:frame:sim', 0, 1, 3),
        entry('vox:frame:sim', 1, 1, 2),
        entry('vox:frame:sim', 2, 1, 'ticks'),
        entry('vox:frame:sim', 3, 1),
        entry('vox:frame:sim', 4, 1, Number.NaN),
      ],
      0,
    );
    expect(summary['vox:frame:sim']?.detailTotal).toBe(5);
    expect(summary['vox:frame:sim']?.count).toBe(5);
  });
});
