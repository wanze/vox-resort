import { describe, expect, it } from 'vitest';
import { dragged, relaxed, STILL_GLANCE, turnedTo, zoomed, type Glance } from './glance';

const looked: Glance = { yaw: 1, pitch: 0.4, zoom: 2, idle: 0 };

describe('dragged', () => {
  it('clamps the pitch to each view’s limits', () => {
    expect(dragged(STILL_GLANCE, 0, 1000, 'first').pitch).toBe(0.5);
    expect(dragged(STILL_GLANCE, 0, -1000, 'first').pitch).toBe(-0.6);
    expect(dragged(STILL_GLANCE, 0, 1000, 'third').pitch).toBe(0.9);
    expect(dragged(STILL_GLANCE, 0, -1000, 'third').pitch).toBe(-0.3);
  });

  it('turns by 0.005 a pixel across and resets the idle time', () => {
    const turned = dragged({ ...STILL_GLANCE, idle: 5 }, 100, 0, 'third');
    expect(turned.yaw).toBeCloseTo(-0.5);
    expect(turned.idle).toBe(0);
  });

  it('keeps a pitch inside the other view’s limits on a switch', () => {
    expect(turnedTo({ ...STILL_GLANCE, pitch: 0.9 }, 'first').pitch).toBe(0.5);
  });
});

describe('zoomed', () => {
  it('stays between half and three times', () => {
    expect(zoomed(STILL_GLANCE, 10).zoom).toBe(3);
    expect(zoomed(STILL_GLANCE, 0.1).zoom).toBe(0.5);
  });
});

describe('relaxed', () => {
  it('does not spring back before two idle seconds', () => {
    const waited = relaxed(looked, 1.9);
    expect(waited.yaw).toBe(1);
    expect(waited.pitch).toBe(0.4);
  });

  it('springs back with a 0.6 s half-life after two seconds, and keeps the zoom', () => {
    const quarter = relaxed(relaxed(looked, 1), 1 + 4 * 0.6);
    expect(quarter.yaw).toBeCloseTo(1 / 16, 9);
    expect(quarter.zoom).toBe(2);
    const back = relaxed(looked, 2 + 7 * 0.6);
    expect(Math.abs(back.yaw)).toBeLessThan(0.01);
    expect(Math.abs(back.pitch)).toBeLessThan(0.01 * 0.4);
  });
});
