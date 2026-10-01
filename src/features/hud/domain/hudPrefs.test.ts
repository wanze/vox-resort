import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from './hudPrefs';

describe('parsePrefs', () => {
  it('falls back to the defaults on anything that is not a preferences object', () => {
    for (const garbage of [null, 3, 'urgent', [], { muted: 'warning' }]) {
      expect(parsePrefs(garbage)).toEqual(DEFAULT_PREFS);
    }
  });

  it('reads back what was stored', () => {
    const prefs = { muted: ['warning' as const] };
    expect(parsePrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
  });

  it('drops a severity it does not know', () => {
    expect(parsePrefs({ muted: ['urgent', 'gossip', 7, 'urgent'] })).toEqual({ muted: ['urgent'] });
  });
});
