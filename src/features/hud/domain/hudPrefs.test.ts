import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from './hudPrefs';

describe('parsePrefs', () => {
  it('falls back to the defaults on anything that is not a preferences object', () => {
    for (const garbage of [null, 3, 'urgent', [], { muted: 'warning' }]) {
      expect(parsePrefs(garbage)).toEqual(DEFAULT_PREFS);
    }
  });

  it('reads back what was stored', () => {
    const prefs = { muted: ['warning' as const], markers: false };
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
});
