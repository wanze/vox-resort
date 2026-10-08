import { describe, expect, it } from 'vitest';
import type { Pitch } from './beachPitch';
import { VISIT } from './occupancy';
import { ROUTER_COLUMNS, ROUTER_VENUE_COLUMNS } from './routerSnapshot';
import {
  createRouterState,
  restoreRouterState,
  ROUTER_DERIVED,
  ROUTER_SAVED_OTHERWISE,
  snapshotRouterState,
  type Claim,
} from './routerState';

const pitch: Pitch = {
  x: 10,
  z: 20,
  tile: 33,
  spots: [
    { x: 9, z: 20, y: 0, heading: 0, seat: 5, pose: 0 },
    { x: 11, z: 20, y: 0, heading: 0, seat: -1, pose: 1 },
  ],
};

// Two guests of party 0 on one pitch, guest 2 asleep, guest 3 in the line at venue 1.
const busyState = () => {
  const state = createRouterState(4, 2, 3);
  const claim: Claim = { pitch, routes: [], holders: 2 };
  state.stays[0] = claim;
  state.stays[1] = claim;
  state.partyPitches[0] = claim;
  state.spotOf[1] = 1;
  state.pitched.add(pitch.tile);
  state.promised.add(5);
  state.asleep[2] = 1;
  state.asleepCount = 1;
  state.doorOf[2] = 7;
  state.occupancy.state[3] = VISIT.waiting;
  state.occupancy.at[3] = 1;
  state.occupancy.slot[3] = 0;
  state.occupancy.queues[1]!.push(3);
  state.errands.venue[0] = 2;
  state.stayRoutes[0] = { gate: 4, waypoints: [{ x: 1, z: 2 }], length: 3 };
  state.balkCount[1] = 2;
  return state;
};

const columnsOf = (value: object): unknown[] =>
  Object.values(value).flatMap((inner: unknown) =>
    ArrayBuffer.isView(inner) || Array.isArray(inner)
      ? [inner]
      : typeof inner === 'object' && inner !== null
        ? columnsOf(inner)
        : [],
  );

describe('the guest router state', () => {
  it('declares every field as saved, saved otherwise, or derived', () => {
    const declared = [
      ...ROUTER_COLUMNS,
      ...ROUTER_VENUE_COLUMNS,
      ...ROUTER_SAVED_OTHERWISE,
      ...ROUTER_DERIVED,
    ];
    expect(Object.keys(createRouterState(4, 2, 3)).toSorted()).toEqual(declared.toSorted());
  });

  it('comes back from its snapshot with the claims, the sleepers and the line it had', () => {
    const state = busyState();
    const restored = restoreRouterState(snapshotRouterState(state));
    expect(snapshotRouterState(restored)).toEqual(snapshotRouterState(state));
    const claim = restored.stays[0]!;
    expect(claim.holders).toBe(2);
    expect(restored.stays[1]).toBe(claim);
    expect(restored.partyPitches[0]).toBe(claim);
    expect(restored.partyPitches[1]).toBeNull();
    expect(restored.pitched).toEqual(new Set([33]));
    expect(restored.promised).toEqual(new Set([5]));
    expect(restored.asleepCount).toBe(1);
    expect(restored.occupancy.queues[1]).toEqual([3]);
  });

  it('shares no array between a snapshot, the state it was taken of, and itself', () => {
    const state = busyState();
    const snapshot = snapshotRouterState(state);
    const restored = restoreRouterState(snapshot);
    state.doorOf[2] = 9;
    restored.doorOf[2] = 8;
    expect(snapshot.doorOf[2]).toBe(7);
    const taken = columnsOf(snapshot);
    expect(new Set(taken).size).toBe(taken.length);
    const held = new Set([...columnsOf(state), ...columnsOf(restored)]);
    expect(taken.filter((column) => held.has(column))).toEqual([]);
  });
});
