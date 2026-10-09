import { describe, expect, it } from 'vitest';
import { PHOTO_KINDS } from '../../sim/domain/views';
import { framingOf } from './framing';

const DEGREE = Math.PI / 180;

const framings = (kind: (typeof PHOTO_KINDS)[number]) =>
  Array.from({ length: 2000 }, (_, at) => framingOf(at % 37, ((at * 7) % 101) - 1, at * 13, kind));

describe('framingOf', () => {
  it('stays in range, turning a sight or a show less than a view', () => {
    for (const kind of PHOTO_KINDS) {
      const swing = kind === 'sight' || kind === 'show' ? 5 : 12;
      for (const framing of framings(kind)) {
        expect(Math.abs(framing.headingJitter)).toBeLessThanOrEqual(swing * DEGREE);
        expect(framing.fov).toBeGreaterThanOrEqual(45);
        expect(framing.fov).toBeLessThanOrEqual(70);
        expect(framing.tilt).toBeGreaterThanOrEqual(-0.02);
        expect(framing.tilt).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('spreads over the ranges rather than bunching', () => {
    const all = framings('sea');
    const fovs = all.map((framing) => framing.fov);
    expect(Math.min(...fovs)).toBeLessThan(47);
    expect(Math.max(...fovs)).toBeGreaterThan(68);
    expect(all.filter((framing) => framing.headingJitter < 0).length).toBeGreaterThan(800);
    expect(all.filter((framing) => framing.headingJitter > 0).length).toBeGreaterThan(800);
  });

  it('is the same for the same photo, and another for the next tick', () => {
    expect(framingOf(3, 12, 900, 'sunset')).toEqual(framingOf(3, 12, 900, 'sunset'));
    expect(framingOf(3, 12, 901, 'sunset')).not.toEqual(framingOf(3, 12, 900, 'sunset'));
    expect(framingOf(3, -1, 900, 'sunset')).not.toEqual(framingOf(3, 12, 900, 'sunset'));
  });
});
