import { describe, expect, it } from 'vitest';
import type { DayReport, PhotoSpot } from '../../sim/domain/dayReport';
import type { PhotoKind } from '../../sim/domain/views';
import { enlargedSize, photoWallOf, WALL_KINDS } from './photoWall';

const spot = (key: string, count: number, kind: PhotoKind = 'sight'): PhotoSpot => ({
  key,
  subject: key,
  kind,
  count,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  minute: 600,
});

const reportWith = (spots: readonly PhotoSpot[]) => ({ photos: { taken: 9, spots } }) as DayReport;

const keysOf = (wall: ReturnType<typeof photoWallOf>) => wall.shown.map((card) => card.spot.key);

describe('photoWallOf', () => {
  it('is empty before the first photo and without a report', () => {
    expect(photoWallOf(null, [])).toEqual({ taken: 0, today: [], yesterday: [], shown: [] });
  });

  it("hangs every one of today's spots, by count within a group, ties by key", () => {
    const spots = Array.from({ length: 30 }, (_, at) => spot(`s${at}`, at % 3));
    const wall = photoWallOf({ taken: 40, spots }, []);
    expect(wall.taken).toBe(40);
    expect(wall.shown).toHaveLength(30);
    expect(keysOf(wall).slice(0, 3)).toEqual(['s11', 's14', 's17']);
  });

  it('groups by kind, sunsets first and views last, and skips a kind with none', () => {
    const wall = photoWallOf(
      {
        taken: 6,
        spots: [
          spot('sea-a', 9, 'sea'),
          spot('view-a', 2, 'view'),
          spot('sunset-a', 1, 'sunset'),
          spot('sea-b', 3, 'sea'),
          spot('show-a', 1, 'show'),
        ],
      },
      [],
    );
    expect(wall.today.map((group) => group.kind)).toEqual(['sunset', 'show', 'sea', 'view']);
    expect(keysOf(wall)).toEqual(['sunset-a', 'show-a', 'sea-a', 'sea-b', 'view-a']);
    expect(WALL_KINDS).toHaveLength(7);
  });

  it("adds yesterday's from the last report after today's, as cards of their own", () => {
    const wall = photoWallOf({ taken: 1, spots: [spot('a', 1)] }, [
      reportWith([spot('old', 4)]),
      reportWith([spot('a', 3), spot('b', 5, 'sunset')]),
    ]);
    expect(wall.yesterday.map((group) => group.kind)).toEqual(['sunset', 'sight']);
    expect(keysOf(wall)).toEqual(['a', 'b', 'a']);
    expect(new Set(wall.shown.map((card) => card.id)).size).toBe(3);
    expect(wall.shown.map((card) => card.daysAgo)).toEqual([0, 1, 1]);
  });

  it("gives a spot new cards once today's photos are yesterday's", () => {
    const report = (day: number) => ({ ...reportWith([spot('a', 2)]), day }) as DayReport;
    const before = photoWallOf({ taken: 1, spots: [spot('a', 1)] }, [report(3)]);
    const after = photoWallOf({ taken: 1, spots: [spot('a', 1)] }, [report(3), report(4)]);
    expect(after.shown[1]!.id).toBe(before.shown[0]!.id);
    expect(after.shown[0]!.id).not.toBe(before.shown[0]!.id);
  });
});

describe('enlargedSize', () => {
  it('is 960 by 640 with room for it, and shrinks at 3:2 to fit a phone', () => {
    expect(enlargedSize({ width: 1600, height: 900 })).toEqual({ width: 960, height: 640 });
    expect(enlargedSize({ width: 358, height: 500 })).toEqual({ width: 358, height: 238 });
    expect(enlargedSize({ width: 1200, height: 320 })).toEqual({ width: 480, height: 320 });
  });
});
