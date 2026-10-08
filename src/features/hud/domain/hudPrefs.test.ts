import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from './hudPrefs';

describe('parsePrefs', () => {
  it('falls back to the defaults on anything that is not a preferences object', () => {
    for (const garbage of [null, 3, 'urgent', [], { muted: 'warning' }]) {
      expect(parsePrefs(garbage)).toEqual(DEFAULT_PREFS);
    }
  });

  it('reads back what was stored', () => {
    const prefs = {
      muted: ['warning' as const],
      markers: false,
      staff: true,
      signs: false,
      singleKeys: false,
    };
    expect(parsePrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
  });

  it('drops a severity it does not know', () => {
    expect(parsePrefs({ muted: ['urgent', 'gossip', 7, 'urgent'] }).muted).toEqual(['urgent']);
  });

  it('shows the markers unless they were turned off', () => {
    for (const garbage of [undefined, 'false', 0, null]) {
      expect(parsePrefs({ muted: [], markers: garbage }).markers).toBe(true);
    }
    expect(parsePrefs({ muted: [], markers: false }).markers).toBe(false);
  });

  it('keeps the staff pins away unless they were turned on, as in a store from before them', () => {
    expect(parsePrefs({ muted: [], markers: true }).staff).toBe(false);
    expect(parsePrefs({ muted: [], markers: true, staff: 'yes' }).staff).toBe(false);
    expect(parsePrefs({ muted: [], markers: true, staff: true }).staff).toBe(true);
  });

  it('hangs the signs unless they were taken down, as in a store from before them', () => {
    expect(parsePrefs({ muted: [], markers: true, staff: false }).signs).toBe(true);
    expect(parsePrefs({ muted: [], signs: 'no' }).signs).toBe(true);
    expect(parsePrefs({ muted: [], signs: false }).signs).toBe(false);
  });

  it('hears single-key shortcuts unless they were turned off, as in a store from before them', () => {
    expect(parsePrefs({ muted: [], markers: true, staff: false, signs: true }).singleKeys).toBe(
      true,
    );
    expect(parsePrefs({ muted: [], singleKeys: 'off' }).singleKeys).toBe(true);
    expect(parsePrefs({ muted: [], singleKeys: false }).singleKeys).toBe(false);
  });
});
