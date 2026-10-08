import { describe, expect, it } from 'vitest';
import { blursAfter, pressesControl, type KeyTarget } from './keyTarget';

const target = (tag: string, overrides: Partial<KeyTarget> = {}): KeyTarget => ({
  tag,
  role: null,
  href: false,
  keyboardFocus: true,
  ...overrides,
});

const ROLES = [
  'button',
  'tab',
  'menuitem',
  'menuitemradio',
  'menuitemcheckbox',
  'radio',
  'switch',
  'checkbox',
];

describe('pressesControl', () => {
  it('leaves Space and Enter to a button the keyboard is on', () => {
    expect(pressesControl(target('button'), ' ')).toBe(true);
    expect(pressesControl(target('button'), 'enter')).toBe(true);
  });

  it('does the same for a summary, a link and every role a key presses', () => {
    const controls = [
      target('summary'),
      target('a', { href: true }),
      ...ROLES.map((role) => target('div', { role })),
    ];
    for (const control of controls) {
      expect(pressesControl(control, ' ')).toBe(true);
      expect(pressesControl(control, 'enter')).toBe(true);
    }
  });

  it('takes Space from a clicked button, which is then blurred so it is not pressed twice', () => {
    const clicked = target('button', { keyboardFocus: false });
    expect(pressesControl(clicked, ' ')).toBe(false);
    expect(blursAfter(clicked)).toBe(true);
  });

  it('lets other shortcuts run on a keyboard-focused button and keeps its focus', () => {
    for (const key of ['b', 'escape']) {
      expect(pressesControl(target('button'), key)).toBe(false);
    }
    expect(blursAfter(target('button'))).toBe(false);
  });

  it('ignores anything that is not a control', () => {
    const others: [string, Partial<KeyTarget>][] = [
      ['a', {}],
      ['div', {}],
      ['div', { role: 'tablist' }],
      ['div', { role: 'option' }],
    ];
    for (const [tag, overrides] of others) {
      for (const keyboardFocus of [true, false]) {
        const other = target(tag, { ...overrides, keyboardFocus });
        expect(pressesControl(other, ' ')).toBe(false);
        expect(blursAfter(other)).toBe(false);
      }
    }
    expect(pressesControl(null, ' ')).toBe(false);
    expect(blursAfter(null)).toBe(false);
  });
});
