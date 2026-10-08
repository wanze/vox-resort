import { describe, expect, it } from 'vitest';
import { reportDue } from './reportPace';

describe('reportDue', () => {
  it('is due when nothing was reported yet', () => {
    expect(reportDue(null, 0)).toBe(true);
  });

  it('waits a quarter second after a report', () => {
    expect(reportDue(1000, 1249)).toBe(false);
    expect(reportDue(1000, 1250)).toBe(true);
    expect(reportDue(1000, 4000)).toBe(true);
  });

  it('honours a custom gap', () => {
    expect(reportDue(0, 99, 100)).toBe(false);
    expect(reportDue(0, 100, 100)).toBe(true);
  });

  it('folds a drag that changes every frame into four reports a second', () => {
    let told: number | null = null;
    const reported: number[] = [];
    for (let frame = 0; frame < 120; frame++) {
      const nowMs = frame * 16;
      if (!reportDue(told, nowMs)) continue;
      reported.push(nowMs);
      told = nowMs;
    }
    expect(reported).toEqual([0, 256, 512, 768, 1024, 1280, 1536, 1792]);
  });
});
