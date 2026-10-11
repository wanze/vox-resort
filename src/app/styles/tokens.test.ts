import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const start = css.indexOf(':root {');
const root = css.slice(start, css.indexOf('\n}', start));
const tokens = new Map(
  [...root.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, value]) => [
    name!,
    value!,
  ]),
);

function channel(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(colour: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => channel(Number.parseInt(colour.slice(at, at + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [darker, lighter] = [luminance(a), luminance(b)].toSorted((x, y) => x - y);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function hex(name: string): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`${name} is not a hex token in :root`);
  return value;
}

const TEXTS = [
  '--text',
  '--text-dim',
  '--text-faint',
  '--text-good',
  '--text-bad',
  '--text-figure',
  '--terracotta-deep',
];

// The panels' slab runs stone-100 to stone-300, sunken fields stone-300 to stone-200, and the
// palette's shelves are the tray.
const GROUNDS = ['--stone-50', '--stone-100', '--stone-200', '--stone-300', '--tray'];

const PAIRS: readonly (readonly [string, string])[] = [
  ...TEXTS.flatMap((text) => GROUNDS.map((ground) => [text, ground] as const)),
  ['--text-on-accent', '--alert'],
];

describe('the HUD tokens', () => {
  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it.each(PAIRS)('%s reads at 4.5:1 on %s', (text, ground) => {
    expect(contrast(hex(text), hex(ground))).toBeGreaterThanOrEqual(4.5);
  });

  it('sets labels no smaller than notes', () => {
    const size = /--size-label: (\d+)px;/.exec(root)?.[1];
    expect(Number(size)).toBeGreaterThanOrEqual(12);
  });
});
