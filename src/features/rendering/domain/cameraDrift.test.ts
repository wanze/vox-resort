import { describe, expect, it } from 'vitest';
import { driftedOrbit, type Orbit } from './cameraDrift';

const BASE: Orbit = { radius: 400, polar: 1, azimuth: 0.5 };

const samples = (): Orbit[] => Array.from({ length: 2000 }, (_, i) => driftedOrbit(BASE, i * 0.37));

describe('driftedOrbit', () => {
  it('starts exactly where the camera was framed', () => {
    const start = driftedOrbit(BASE, 0);
    expect(start.radius).toBeCloseTo(BASE.radius, 9);
    expect(start.polar).toBeCloseTo(BASE.polar, 9);
    expect(start.azimuth).toBeCloseTo(BASE.azimuth, 9);
  });

  it('only ever lifts the camera, never tilts it towards the horizon', () => {
    for (const orbit of samples()) expect(orbit.polar).toBeLessThanOrEqual(BASE.polar);
  });

  it('stays near the framing: a small swing and a gentle dolly', () => {
    for (const orbit of samples()) {
      expect(Math.abs(orbit.azimuth - BASE.azimuth)).toBeLessThan(0.35);
      expect(Math.abs(orbit.radius / BASE.radius - 1)).toBeLessThan(0.15);
      expect(BASE.polar - orbit.polar).toBeLessThan(0.1);
    }
  });

  it('moves slowly enough to read as drifting rather than flying', () => {
    const step = 1 / 60;
    for (let seconds = 0; seconds < 200; seconds += 1.3) {
      const now = driftedOrbit(BASE, seconds);
      const next = driftedOrbit(BASE, seconds + step);
      expect(Math.abs(next.azimuth - now.azimuth) / step).toBeLessThan(0.05);
      expect(Math.abs(next.radius - now.radius) / step / BASE.radius).toBeLessThan(0.05);
    }
  });
});
