import { describe, expect, it } from 'vitest';
import type { Plaza } from '../../layout/domain/resortPlan';
import { ONE_OFF, styleMix } from './styleMix';

const block = (index: number): Plaza => ({
  x0: index * 10,
  x1: index * 10 + 9,
  z0: 0,
  z1: 9,
});

const NEIGHBOURHOODS = Array.from({ length: 200 }, (_, index) => block(index));

describe('styleMix', () => {
  it('styles a plot alike every time for one seed', () => {
    const first = styleMix({ seed: 3, neighbourhoods: NEIGHBOURHOODS, oneOff: ONE_OFF });
    const again = styleMix({ seed: 3, neighbourhoods: NEIGHBOURHOODS, oneOff: ONE_OFF });
    for (let x = 0; x < 400; x += 7) {
      expect(again('bakery', x, 4)).toBe(first('bakery', x, 4));
    }
  });

  it('builds one family in one style throughout a neighbourhood', () => {
    const styleOf = styleMix({ seed: 5, neighbourhoods: NEIGHBOURHOODS, oneOff: 0 });
    for (const [index, rect] of NEIGHBOURHOODS.slice(0, 20).entries()) {
      const styles = new Set<string>();
      for (let x = rect.x0; x <= rect.x1; x++) {
        for (let z = rect.z0; z <= rect.z1; z++) styles.add(styleOf('hotel', x, z));
      }
      expect(styles.size, `neighbourhood ${index}`).toBe(1);
    }
  });

  it('shares the styles out about evenly across neighbourhoods', () => {
    const styleOf = styleMix({ seed: 11, neighbourhoods: NEIGHBOURHOODS, oneOff: 0 });
    const variants = NEIGHBOURHOODS.filter(
      (rect) => styleOf('villa', rect.x0, rect.z0) !== 'villa',
    );
    expect(variants.length).toBeGreaterThanOrEqual(70);
    expect(variants.length).toBeLessThanOrEqual(130);
  });

  it('rolls every placement on its own when told to scatter', () => {
    const styleOf = styleMix({ seed: 2, neighbourhoods: [block(0)], oneOff: 1 });
    const styles = new Set<string>();
    for (let x = 0; x <= 9; x++) {
      for (let z = 0; z <= 9; z++) styles.add(styleOf('street-lamp', x, z));
    }
    expect([...styles].toSorted()).toEqual(['street-lamp', 'street-lamp-b']);
  });

  it('falls back to render-chunk cells outside every neighbourhood', () => {
    const styleOf = styleMix({ seed: 9, neighbourhoods: [], oneOff: 0 });
    const inCell = new Set<string>();
    for (let x = 16; x < 32; x++) inCell.add(styleOf('bench', x, 40));
    expect(inCell.size).toBe(1);
  });

  it('passes a family of one and an unknown id through', () => {
    const styleOf = styleMix({ seed: 1, neighbourhoods: NEIGHBOURHOODS, oneOff: 1 });
    expect(styleOf('path', 3, 3)).toBe('path');
    expect(styleOf('casino', 3, 3)).toBe('casino');
  });
});
