import { describe, expect, it } from 'vitest';
import { STAFF_COLUMNS } from './staffRouterSnapshot';
import {
  createStaffRouterState,
  restoreStaffState,
  snapshotStaffState,
  STAFF_NOT_SAVED,
} from './staffRouterState';

// A cleaner at venue 2 with half a cart, a lifeguard up tower 5 kept over an edit.
const busyState = () => {
  const state = createStaffRouterState(3, 4);
  state.assigned[0] = 2;
  state.working[0] = 1;
  state.until[0] = 600;
  state.doorOf[0] = 11;
  state.load[0] = 2;
  state.towerOf[1] = 5;
  state.legRoute[1] = { gate: 3, waypoints: [{ x: 1, z: 2 }], length: 4 };
  state.keptWater[1] = 7;
  state.keptTower[1] = 1;
  state.goingHome[2] = 1;
  return state;
};

const columnsOf = (value: object): unknown[] =>
  Object.values(value).filter((inner) => ArrayBuffer.isView(inner) || Array.isArray(inner));

describe('the staff router state', () => {
  it('declares every field as saved or not saved', () => {
    const declared = [...STAFF_COLUMNS, ...STAFF_NOT_SAVED];
    expect(Object.keys(createStaffRouterState(3, 4)).toSorted()).toEqual(declared.toSorted());
  });

  it('comes back from its snapshot as it was, but for what is never saved', () => {
    const state = busyState();
    const restored = restoreStaffState(snapshotStaffState(state));
    expect(snapshotStaffState(restored)).toEqual(snapshotStaffState(state));
    expect(restored.load[1]).toBe(4);
    expect(Array.from(restored.keptWater)).toEqual([-1, -1, -1]);
    expect(Array.from(restored.keptTower)).toEqual([0, 0, 0]);
  });

  it('shares no array between a snapshot, the state it was taken of, and itself', () => {
    const state = busyState();
    const snapshot = snapshotStaffState(state);
    const restored = restoreStaffState(snapshot);
    state.assigned[0] = 9;
    restored.assigned[0] = 8;
    expect(snapshot.assigned[0]).toBe(2);
    const taken = columnsOf(snapshot);
    expect(new Set(taken).size).toBe(taken.length);
    const held = new Set([...columnsOf(state), ...columnsOf(restored)]);
    expect(taken.filter((column) => held.has(column))).toEqual([]);
  });
});
