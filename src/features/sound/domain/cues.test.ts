import { describe, expect, it } from 'vitest';
import { createRandom } from '../../layout/domain/random';
import {
  cueAllowed,
  cueDetune,
  fadeCurve,
  loopSchedule,
  pickVariant,
  toastCue,
  toastCueOf,
} from './cues';

const sequence = (values: readonly number[]) => {
  let at = 0;
  return () => values[at++ % values.length]!;
};

describe('cueAllowed', () => {
  it('holds a dragged cue back for its cooldown, and lets an event cue repeat at once', () => {
    expect(cueAllowed('pave', undefined, 0)).toBe(true);
    expect(cueAllowed('pave', 1000, 1050)).toBe(false);
    expect(cueAllowed('pave', 1000, 1070)).toBe(true);
    expect(cueAllowed('built', 1000, 1100)).toBe(false);
    expect(cueAllowed('demolish', 1000, 1000)).toBe(true);
  });
});

describe('pickVariant', () => {
  it('never plays the same variant twice in a row', () => {
    const random = createRandom(7);
    let last = -1;
    for (let draw = 0; draw < 500; draw++) {
      const next = pickVariant(3, last, random);
      expect(next).not.toBe(last);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(3);
      last = next;
    }
  });

  it('plays the one file of a one-file slot every time', () => {
    expect(pickVariant(1, 0, sequence([0.9]))).toBe(0);
    expect(pickVariant(1, -1, sequence([0.1]))).toBe(0);
  });
});

describe('cueDetune', () => {
  it('detunes the repeated cues within 60 cents and leaves the jingles in tune', () => {
    for (const draw of [0, 0.25, 0.5, 0.999]) {
      const cents = cueDetune('pave', () => draw);
      expect(Math.abs(cents)).toBeLessThanOrEqual(60);
    }
    expect(cueDetune('click', () => 0)).toBe(-60);
    expect(cueDetune('morning', () => 0)).toBe(0);
  });
});

describe('loopSchedule', () => {
  it('overlaps each pass with the next by the fade', () => {
    expect(loopSchedule(20, 1.5)).toEqual({ kind: 'crossfade', period: 18.5, fade: 1.5 });
  });

  it('loops a file too short to crossfade plainly', () => {
    expect(loopSchedule(4, 1.5)).toEqual({ kind: 'plain' });
  });

  it('fades at equal power, rising and falling', () => {
    const rising = fadeCurve(9, true);
    const falling = fadeCurve(9, false);
    expect(rising[0]).toBe(0);
    expect(rising[8]).toBeCloseTo(1);
    for (let step = 0; step < 9; step++) {
      expect(rising[step]! ** 2 + falling[step]! ** 2).toBeCloseTo(1);
    }
  });
});

describe('toastCue', () => {
  it('alerts for urgent news, notices a warning and chimes the day', () => {
    expect(toastCue('urgent')).toBe('alert');
    expect(toastCue('warning')).toBe('notice');
    expect(toastCue('day')).toBe('day');
  });

  it('keeps an offered update quiet', () => {
    expect(toastCueOf({ kind: 'update', phase: 'ready', until: null })).toBeNull();
  });
});
