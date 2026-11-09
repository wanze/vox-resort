import { describe, expect, it } from 'vitest';
import { createEvents } from './eventRuns';
import { eventsSnapshotSchema, restoreEvents, snapshotEvents } from './eventsSnapshot';
import { BUILT_INS, book, occurrencesOn, withBuiltIns, withCeremony } from './programme';

const played = () => {
  const state = createEvents(6);
  state.programme = book(
    state.programme,
    {
      kind: 'live-music',
      site: { kind: 'stage', venue: 'beach-club#0' },
      repeat: { every: 'week', weekday: 3 },
      start: 20 * 60,
    },
    0,
  ).programme;
  const [occurrence] = occurrencesOn(state.programme, 3);
  state.runs = [
    {
      occurrence: occurrence!,
      phase: 'running',
      parties: [1, 4],
      attended: new Set([2, 5]),
      paid: 150,
      salt: 99,
    },
  ];
  state.glow[2] = 0.08;
  state.tired.add(4);
  return state;
};

describe('events snapshots', () => {
  it('restore the programme, the running event, the glow and who is up late', () => {
    const state = played();
    const saved = eventsSnapshotSchema.parse(structuredClone(snapshotEvents(state)));
    const restored = restoreEvents(saved, 6);
    expect(restored).toEqual(state);
    expect(snapshotEvents(restored)).toEqual(snapshotEvents(state));
  });

  it('keeps a welcome drink at its reception', () => {
    const state = createEvents(6);
    state.programme = withBuiltIns(state.programme, BUILT_INS, [
      { kind: 'lobby', venue: 'reception#0' },
    ]);
    const saved = eventsSnapshotSchema.parse(structuredClone(snapshotEvents(state)));
    expect(restoreEvents(saved, 6).programme).toEqual(state.programme);
  });

  it('keeps a ceremony with its group, and its run', () => {
    const state = createEvents(6);
    state.programme = withCeremony(state.programme, {
      group: 7,
      day: 4,
      site: { kind: 'stage', venue: 'stage-plaza#0' },
      start: 15 * 60,
    });
    const [occurrence] = occurrencesOn(state.programme, 4);
    state.runs = [
      {
        occurrence: occurrence!,
        phase: 'announced',
        parties: [],
        attended: new Set(),
        paid: 0,
        salt: 1,
      },
    ];
    const saved = eventsSnapshotSchema.parse(structuredClone(snapshotEvents(state)));
    const restored = restoreEvents(saved, 6);
    expect(restored.programme.bookings[0]!.group).toBe(7);
    expect(restored.runs[0]!.occurrence.group).toBe(7);
    expect(restored).toEqual(state);
  });

  it('loads a save from before ceremonies, whose bookings have no group', () => {
    const saved = snapshotEvents(played());
    expect('group' in saved.programme.bookings[0]!).toBe(false);
    const restored = restoreEvents(eventsSnapshotSchema.parse(structuredClone(saved)), 6);
    expect(restored.programme.bookings[0]!.group).toBeUndefined();
  });

  it('drops a kind it does not know, from a later version', () => {
    const saved = snapshotEvents(played());
    const later = {
      ...saved,
      programme: {
        ...saved.programme,
        bookings: [
          ...saved.programme.bookings,
          { ...saved.programme.bookings[0]!, id: 9, kind: 'regatta' },
        ],
      },
      runs: [{ ...saved.runs[0]!, occurrence: { ...saved.runs[0]!.occurrence, kind: 'regatta' } }],
    };
    const restored = restoreEvents(eventsSnapshotSchema.parse(later), 6);
    expect(restored.programme.bookings.map((booking) => booking.id)).toEqual([1]);
    expect(restored.runs).toEqual([]);
  });

  it('pads the glow to a grown population', () => {
    const restored = restoreEvents(snapshotEvents(played()), 9);
    expect(restored.glow).toHaveLength(9);
    expect(restored.glow[2]).toBeCloseTo(0.08);
  });
});
