import { describe, expect, it } from 'vitest';
import { busGain, DEFAULT_SOUND_PREFS, parseSoundPrefs } from './soundPrefs';

describe('parseSoundPrefs', () => {
  it('falls back to the defaults for junk', () => {
    expect(parseSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
    expect(parseSoundPrefs('loud')).toEqual(DEFAULT_SOUND_PREFS);
    expect(parseSoundPrefs({ on: 'yes', music: 'half' })).toEqual(DEFAULT_SOUND_PREFS);
  });

  it('keeps what an older store has and defaults the rest', () => {
    expect(parseSoundPrefs({ on: false, music: 0.2 })).toEqual({
      ...DEFAULT_SOUND_PREFS,
      on: false,
      music: 0.2,
    });
  });

  it('clamps every level to 0..1', () => {
    const prefs = parseSoundPrefs({ master: 3, effects: -1, ambience: Number.NaN });
    expect(prefs.master).toBe(1);
    expect(prefs.effects).toBe(0);
    expect(prefs.ambience).toBe(DEFAULT_SOUND_PREFS.ambience);
  });
});

describe('busGain', () => {
  it('multiplies the bus by the master, and is silent when off', () => {
    const prefs = { ...DEFAULT_SOUND_PREFS, master: 0.5, music: 0.4 };
    expect(busGain(prefs, 'music')).toBeCloseTo(0.2);
    expect(busGain({ ...prefs, on: false }, 'music')).toBe(0);
    expect(busGain({ ...prefs, on: false }, 'interface')).toBe(0);
  });
});
