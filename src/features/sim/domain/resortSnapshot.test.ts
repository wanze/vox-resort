import { describe, expect, it } from 'vitest';
import {
  createGuests,
  restoreGuests,
  snapshotGuests,
  checkInParty,
  freeBodiesOf,
} from '../../guests/domain/guests';
import type { Home } from '../../guests/domain/homes';
import { createRandom } from '../../layout/domain/random';
import { createHappiness, restoreHappiness, snapshotHappiness } from './happiness';
import { createNeeds, restoreNeeds, snapshotNeeds } from './needs';
import {
  clockSnapshotSchema,
  guestsSnapshotSchema,
  happinessSnapshotSchema,
  needsSnapshotSchema,
  thoughtsSnapshotSchema,
  upkeepSnapshotSchema,
} from './resortSnapshot';
import {
  createDay,
  createThoughts,
  restoreThoughts,
  snapshotThoughts,
  tallyInto,
  think,
} from './thoughts';
import { createUpkeep, restoreUpkeep, snapshotUpkeep } from './upkeep';

const HOMES: readonly Home[] = [
  { key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 30 },
  { key: 'bungalow#0', id: 'bungalow', label: 'Bungalow', beds: 4 },
];

const guestsFor = (seed: number) =>
  createGuests({ count: 60, homes: HOMES, variants: 4, childVariant: 3, seed });

describe('guest snapshots', () => {
  it('restore a guest list, parties and names included, into a fresh one', () => {
    const guests = guestsFor(5);
    guests.present.fill(0, 0, 10);
    checkInParty(guests, { random: createRandom(3), day: 4, free: freeBodiesOf(guests) });
    const saved = snapshotGuests(guests);

    const fresh = guestsFor(6);
    restoreGuests(fresh, saved);

    expect(snapshotGuests(fresh)).toEqual(saved);
    expect(guestsSnapshotSchema.safeParse(saved).success).toBe(true);
  });

  it('copies, so the running game cannot change a snapshot waiting to be written', () => {
    const guests = guestsFor(5);
    const saved = snapshotGuests(guests);
    guests.present[0] = 0;
    expect(saved.present[0]).toBe(1);
  });

  it('refuses a column of the wrong array type', () => {
    const saved = snapshotGuests(guestsFor(5));
    expect(guestsSnapshotSchema.safeParse({ ...saved, party: [...saved.party] }).success).toBe(
      false,
    );
    expect(
      guestsSnapshotSchema.safeParse({ ...saved, present: new Int8Array(saved.count) }).success,
    ).toBe(false);
  });
});

describe('need and happiness snapshots', () => {
  it('restore every column into a fresh set', () => {
    const needs = createNeeds(guestsFor(5), 6);
    needs.level.fun[3] = 0.125;
    const saved = snapshotNeeds(needs);
    const fresh = createNeeds(guestsFor(5), 9);
    restoreNeeds(fresh, saved);
    expect(snapshotNeeds(fresh)).toEqual(saved);
    expect(needsSnapshotSchema.safeParse(saved).success).toBe(true);
    expect(needsSnapshotSchema.safeParse({ ...saved, fun: new Float64Array(60) }).success).toBe(
      false,
    );
  });

  it('restore the mood', () => {
    const happiness = createHappiness(20);
    happiness.level[7] = 0.25;
    happiness.stay[7] = 0.4;
    const saved = snapshotHappiness(happiness);
    const fresh = createHappiness(20);
    restoreHappiness(fresh, saved);
    expect(snapshotHappiness(fresh)).toEqual(saved);
    expect(happinessSnapshotSchema.safeParse({ level: [0.5] }).success).toBe(false);
  });
});

describe('thought snapshots', () => {
  it('restore every field and the day tally into fresh ones', () => {
    const thoughts = createThoughts(12);
    const day = createDay();
    think(thoughts, 2, 'queue-too-long', 'Snack bar', 40);
    think(thoughts, 2, 'enjoyed', 'Pool', 50);
    think(thoughts, 5, 'no-bed', null, 60);
    tallyInto(day, 'queue-too-long', 'Snack bar');
    tallyInto(day, 'queue-too-long', 'Snack bar');
    const saved = snapshotThoughts(thoughts, day);

    const fresh = createThoughts(12);
    const freshDay = createDay();
    tallyInto(freshDay, 'closed', 'Bar');
    restoreThoughts(fresh, freshDay, saved);

    expect(snapshotThoughts(fresh, freshDay)).toEqual(saved);
    expect([...freshDay.keys()]).toEqual(['queue-too-long|Snack bar']);
    expect(thoughtsSnapshotSchema.safeParse(saved).success).toBe(true);
    expect(thoughtsSnapshotSchema.safeParse({ ...saved, stay: new Int32Array(96) }).success).toBe(
      false,
    );
  });
});

describe('upkeep snapshots', () => {
  it('put each venue back by key, whatever order the venues come in now', () => {
    const upkeep = createUpkeep(3);
    upkeep.level.set([0.2, 0.5, 0.9]);
    const before = [{ key: 'bar#0' }, { key: 'pool#0' }, { key: 'snack#0' }];
    const saved = snapshotUpkeep(upkeep, before);

    const restored = restoreUpkeep(saved, [{ key: 'snack#0' }, { key: 'new#0' }, { key: 'bar#0' }]);

    expect([...restored.level]).toEqual([Math.fround(0.9), 1, Math.fround(0.2)]);
    expect(upkeepSnapshotSchema.safeParse({ ...saved, level: [0.2] }).success).toBe(false);
  });
});

describe('clock snapshots', () => {
  it('take a paused clock with no forced weather, and refuse an unknown speed', () => {
    const clock = { ticks: 1440, speed: 'paused', carry: 0.5, forced: null };
    expect(clockSnapshotSchema.safeParse(clock).success).toBe(true);
    expect(clockSnapshotSchema.safeParse({ ...clock, speed: 'warp' }).success).toBe(false);
    expect(clockSnapshotSchema.safeParse({ ...clock, forced: 'snow' }).success).toBe(false);
  });
});
