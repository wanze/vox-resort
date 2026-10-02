import { describe, expect, it } from 'vitest';
import {
  staffPerWorker,
  staffRouterSnapshotSchema,
  staffVenuesMatch,
  type StaffRouterSnapshot,
} from './staffRouterSnapshot';

const snapshotOf = (workers: number): StaffRouterSnapshot => ({
  assigned: new Int32Array(workers).fill(-1),
  until: new Int32Array(workers),
  working: new Uint8Array(workers),
  doorOf: new Int32Array(workers).fill(-1),
  tileOf: new Int32Array(workers).fill(-1),
  roomOf: new Int32Array(workers).fill(-1),
  lastStage: new Int32Array(workers).fill(-1),
  sheltering: new Uint8Array(workers),
  towerOf: new Int32Array(workers).fill(-1),
  legOf: new Int32Array(workers),
  legRoute: Array.from({ length: workers }, () => null),
  load: new Uint8Array(workers).fill(4),
  restocking: new Uint8Array(workers),
  goingHome: new Uint8Array(workers),
  now: 600,
  random: 12345,
});

describe('a staff router snapshot', () => {
  it('parses, and lists a column per worker for every per-worker array', () => {
    const snapshot = snapshotOf(5);
    expect(staffRouterSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const columns = staffPerWorker(snapshot);
    expect(columns).toHaveLength(14);
    expect(columns.every((column) => column.length === 5)).toBe(true);
  });

  it('refuses a column of the wrong array type', () => {
    const snapshot = { ...snapshotOf(5), working: new Int8Array(5) };
    expect(staffRouterSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('matches a venue list only if every assignment and last stage is on it', () => {
    const snapshot = snapshotOf(3);
    snapshot.assigned[1] = 4;
    snapshot.lastStage[2] = 2;
    expect(staffVenuesMatch(snapshot, 5)).toBe(true);
    expect(staffVenuesMatch(snapshot, 4)).toBe(false);
  });

  it('matches a lodging list only if every room being made up is on it', () => {
    const snapshot = snapshotOf(3);
    snapshot.roomOf[0] = 2;
    expect(staffVenuesMatch(snapshot, 1, 3)).toBe(true);
    expect(staffVenuesMatch(snapshot, 1, 2)).toBe(false);
    expect(staffVenuesMatch(snapshot, 1)).toBe(false);
  });

  it('parses a save from before orders, and matches the venues an order names', () => {
    const snapshot = snapshotOf(2);
    expect(staffRouterSnapshotSchema.parse(snapshot).orders).toBeUndefined();
    const ordered = {
      ...snapshot,
      orders: [{ role: 'mechanic' as const, venue: 3, tile: -1, worker: -1, taken: false }],
    };
    expect(staffRouterSnapshotSchema.safeParse(ordered).success).toBe(true);
    expect(staffVenuesMatch(ordered, 4)).toBe(true);
    expect(staffVenuesMatch(ordered, 3)).toBe(false);
  });
});
