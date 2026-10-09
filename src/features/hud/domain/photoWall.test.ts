import { describe, expect, it } from 'vitest';
import type { DayReport, PhotoSpot } from '../../sim/domain/dayReport';
import { photoWallOf, TODAY_SHOWN } from './photoWall';

const spot = (key: string, count: number): PhotoSpot => ({
  key,
  subject: key,
  kind: 'sight',
  count,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  minute: 600,
});

const reportWith = (spots: readonly PhotoSpot[]) => ({ photos: { taken: 9, spots } }) as DayReport;

describe('photoWallOf', () => {
  it('is empty before the first photo and without a report', () => {
    expect(photoWallOf(null, [])).toEqual({ taken: 0, today: [], yesterday: [], shown: [] });
  });

  it("hangs today's most photographed first, ties by key, and only so many", () => {
    const spots = Array.from({ length: TODAY_SHOWN + 2 }, (_, at) => spot(`s${at}`, at % 3));
    const wall = photoWallOf({ taken: 20, spots }, []);
    expect(wall.taken).toBe(20);
    expect(wall.today).toHaveLength(TODAY_SHOWN);
    expect(wall.today.map((each) => each.key).slice(0, 3)).toEqual(['s2', 's5', 's1']);
  });

  it("adds yesterday's top spots from the last report, after today's", () => {
    const wall = photoWallOf({ taken: 1, spots: [spot('a', 1)] }, [
      reportWith([spot('old', 4)]),
      reportWith([spot('b', 3)]),
    ]);
    expect(wall.yesterday.map((each) => each.key)).toEqual(['b']);
    expect(wall.shown.map((each) => each.key)).toEqual(['a', 'b']);
  });
});
