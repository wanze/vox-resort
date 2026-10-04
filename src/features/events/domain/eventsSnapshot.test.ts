import { describe, expect, it } from 'vitest';
import { createEvents } from './eventRuns';
import { eventsSnapshotSchema, restoreEvents, snapshotEvents } from './eventsSnapshot';
import { book, occurrencesOn } from './programme';

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

  it('drops a kind it does not know, from a later version', () => {
    const saved = snapshotEvents(played());
    const later = {
      ...saved,
      programme: {
        ...saved.programme,
        bookings: [
          ...saved.programme.bookings,
          { ...saved.programme.bookings[0]!, id: 9, kind: 'fireworks' },
        ],
      },
      runs: [
        { ...saved.runs[0]!, occurrence: { ...saved.runs[0]!.occurrence, kind: 'fireworks' } },
      ],
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
