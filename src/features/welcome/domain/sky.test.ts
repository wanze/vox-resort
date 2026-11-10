import { describe, expect, it } from 'vitest';
import { HORIZON, skyStage, sunAt } from './sky';

describe('skyStage', () => {
  it('brightens a stage with each step done', () => {
    expect(skyStage([])).toBe('night');
    expect(skyStage(['resort'])).toBe('dawn');
    expect(skyStage(['resort', 'models'])).toBe('morning');
    expect(skyStage(['models', 'resort', 'scene'])).toBe('noon');
  });
});

describe('sunAt', () => {
  it('starts just showing above the horizon', () => {
    const { y } = sunAt([]);
    expect(y).toBeLessThan(HORIZON + 0.06);
    expect(y).toBeGreaterThan(HORIZON - 0.1);
  });

  it('climbs and drifts inwards with each step', () => {
    const path = [[], ['models'], ['models', 'resort'], ['models', 'resort', 'scene']] as const;
    const spots = path.map((done) => sunAt(done));
    spots.slice(1).forEach((spot, index) => {
      expect(spot.y).toBeLessThan(spots[index]?.y ?? 1);
      expect(spot.x).toBeLessThan(spots[index]?.x ?? 1);
    });
  });

  it('slows as it nears the top', () => {
    const start = sunAt([]).y;
    const first = sunAt(['models']).y;
    const second = sunAt(['models', 'resort']).y;
    const last = sunAt(['models', 'resort', 'scene']).y;
    expect(start - first).toBeGreaterThan(second - last);
    expect(last).toBeCloseTo(0.2);
  });
});
