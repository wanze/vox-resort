import { describe, expect, it } from 'vitest';
import { hotkeysFor, keyHeard, keyLabel, KEYMAP, type HudAction } from './keymap';

const ACTIONS = Object.keys(KEYMAP) as (keyof typeof KEYMAP)[];

const HUD_ACTIONS: readonly HudAction[] = [
  'palette',
  'save',
  'find',
  'pause',
  'build',
  'staffPins',
  'signs',
  'sound',
  'land',
  'debug',
  'nextStyle',
  'follow',
  'photo',
  'cancel',
];

describe('KEYMAP', () => {
  it('never gives one key to two actions of the same kind', () => {
    for (const chord of [true, false]) {
      const keys = ACTIONS.filter((action) => (KEYMAP[action].chord === true) === chord).map(
        (action) => KEYMAP[action].key,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('holds every key lower-cased, as the listeners compare it', () => {
    for (const action of ACTIONS) expect(KEYMAP[action].key).toBe(KEYMAP[action].key.toLowerCase());
  });

  it('binds the keys players already know', () => {
    expect(KEYMAP).toEqual({
      palette: { key: 'k', chord: true },
      save: { key: 's', chord: true },
      find: { key: '/' },
      pause: { key: ' ' },
      build: { key: 'b' },
      staffPins: { key: 's' },
      signs: { key: 'n' },
      sound: { key: 'm' },
      land: { key: 'l' },
      debug: { key: 'f3' },
      nextStyle: { key: 'v' },
      follow: { key: 'f' },
      photo: { key: 'p' },
      cancel: { key: 'escape' },
      cameraMode: { key: 'c' },
      turnLeft: { key: 'q' },
      turnRight: { key: 'e' },
      turnPlacement: { key: 'r' },
    });
  });
});

describe('keyLabel', () => {
  it('names a key the way the HUD shows it', () => {
    expect(keyLabel('pause')).toBe('Space');
    expect(keyLabel('cancel')).toBe('Esc');
    expect(keyLabel('debug')).toBe('F3');
    expect(keyLabel('build')).toBe('B');
    expect(keyLabel('find')).toBe('/');
  });

  it('spells a chord with Ctrl, or with ⌘ on a Mac', () => {
    expect(keyLabel('save')).toBe('Ctrl+S');
    expect(keyLabel('save', true)).toBe('⌘S');
    expect(keyLabel('palette')).toBe('Ctrl+K');
  });
});

describe('keyHeard', () => {
  it('turns off only the keys that type a character', () => {
    for (const action of ['pause', 'find', 'build', 'cameraMode', 'turnPlacement'] as const) {
      expect(keyHeard(action, false)).toBe(false);
    }
    for (const action of ['cancel', 'debug', 'save', 'palette'] as const) {
      expect(keyHeard(action, false)).toBe(true);
    }
  });

  it('hears every key while single keys are on', () => {
    for (const action of ACTIONS) expect(keyHeard(action, true)).toBe(true);
  });
});

describe('hotkeysFor', () => {
  const runs = Object.fromEntries(HUD_ACTIONS.map((action) => [action, () => true])) as {
    readonly [action in HudAction]: () => boolean;
  };

  it('gives every action its key from the map', () => {
    const hotkeys = hotkeysFor(runs, true);
    expect(hotkeys).toHaveLength(HUD_ACTIONS.length);
    for (const [index, action] of HUD_ACTIONS.entries()) {
      expect(hotkeys[index]).toEqual({
        key: KEYMAP[action].key,
        chord: KEYMAP[action].chord === true,
        run: runs[action],
      });
    }
  });

  it('keeps only Esc, F3 and the chords while single keys are off', () => {
    const keys = hotkeysFor(runs, false).map((hotkey) => [hotkey.key, hotkey.chord]);
    expect(keys).toEqual([
      ['k', true],
      ['s', true],
      ['f3', false],
      ['escape', false],
    ]);
  });
});
