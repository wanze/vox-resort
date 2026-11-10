import { describe, expect, it } from 'vitest';
import type { Demand, Pressure } from '../../sim/domain/demand';
import type { Review } from '../../sim/domain/reviews';
import { demandFigures, voiceFigures } from './panelFigures';

const line = (pressure: number): Pressure => ({ pressure, used: 0, places: 0, turnedAway: 0 });

const demandOf = (pressures: Partial<Record<keyof Demand['lines'], number>>): Demand => ({
  lines: {
    beds: line(pressures.beds ?? -1),
    energy: line(pressures.energy ?? -1),
    hunger: line(pressures.hunger ?? -1),
    thirst: line(pressures.thirst ?? -1),
    fun: line(pressures.fun ?? -1),
    hygiene: line(pressures.hygiene ?? -1),
    health: line(pressures.health ?? -1),
  },
  groups: { stay: 'beds', food: 'hunger', fun: 'fun', care: 'hygiene' },
});

describe('demandFigures', () => {
  it('counts nothing short when every line has room', () => {
    expect(demandFigures(demandOf({}), 0.6)).toEqual({ short: 0, loud: false, most: null });
  });

  it('counts the lines that want more and names the most pressing', () => {
    const figures = demandFigures(demandOf({ beds: 0.3, hygiene: 0.9, fun: 0 }), 0.6);
    expect(figures).toEqual({ short: 2, loud: true, most: 'hygiene' });
  });

  it('is not loud while every short line is below the loud mark', () => {
    expect(demandFigures(demandOf({ thirst: 0.5 }), 0.6).loud).toBe(false);
  });
});

const review = (stars: number): Review => ({
  party: stars,
  family: 'Roca',
  partyKind: 'couple',
  name: 'Tomislav Roca',
  nights: 4,
  stars,
  complaint: null,
  praise: null,
  subject: null,
});

describe('voiceFigures', () => {
  it('splits what guests said into praise and complaints', () => {
    const figures = voiceFigures(
      [
        { kind: 'enjoyed', subject: 'Beach', count: 11 },
        { kind: 'photo', subject: 'the sea', count: 4 },
        { kind: 'unwatched', subject: 'Beach', count: 3 },
      ],
      [],
    );
    expect(figures).toEqual({ praise: 15, complaints: 3, stars: null });
  });

  it('averages the stars of the reviews given', () => {
    expect(voiceFigures([], [review(4), review(5)]).stars).toBe(4.5);
  });
});
