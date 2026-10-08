import { describe, expect, it } from 'vitest';
import { heldLook, holds, nextDoorway, OUT_OF_SIGHT, type Doorway, type Glimpse } from './doorway';

const at = (x: number) => ({ x, y: 6, z: 0 });

const open = (x: number, clear = false): Glimpse => ({ inside: false, eye: at(x), clear });
const hidden: Glimpse = { inside: true, eye: null, clear: false };
const roofed = (x: number): Glimpse => ({ inside: true, eye: at(x), clear: false });

describe('nextDoorway', () => {
  it('keeps where the guest was last seen in the open', () => {
    expect(nextDoorway(OUT_OF_SIGHT, open(3), 0.1)).toEqual({ kind: 'out', eye: at(3) });
  });

  it('stops at the door on the way in, under a roof as much as out of sight', () => {
    const out: Doorway = { kind: 'out', eye: at(3) };
    expect(nextDoorway(out, hidden, 0.1)).toEqual({ kind: 'in', door: at(3) });
    expect(nextDoorway(out, roofed(4), 0.1)).toEqual({ kind: 'in', door: at(3) });
    expect(nextDoorway({ kind: 'in', door: at(3) }, hidden, 0.1)).toEqual({
      kind: 'in',
      door: at(3),
    });
  });

  it('has no door for somebody already inside when the follow began', () => {
    expect(nextDoorway(OUT_OF_SIGHT, hidden, 0.1)).toEqual({ kind: 'in', door: null });
  });

  it('waits for somebody coming out until they can be seen from the camera', () => {
    const coming = nextDoorway({ kind: 'in', door: at(3) }, open(5), 0.1);
    expect(coming).toEqual({ kind: 'coming', from: at(5), eye: at(5), seconds: 0 });
    expect(nextDoorway(coming, open(6), 0.1).kind).toBe('coming');
    expect(nextDoorway(coming, open(6, true), 0.1)).toEqual({ kind: 'out', eye: at(6) });
  });

  it('lets go after 32 voxels walked or four seconds, seen or not', () => {
    const coming: Doorway = { kind: 'coming', from: at(0), eye: at(0), seconds: 0 };
    expect(nextDoorway(coming, open(33), 0.1).kind).toBe('out');
    expect(nextDoorway({ ...coming, seconds: 3.95 }, open(1), 0.1).kind).toBe('out');
  });

  it('goes back in from the latest place seen', () => {
    const coming: Doorway = { kind: 'coming', from: at(0), eye: at(7), seconds: 1 };
    expect(nextDoorway(coming, hidden, 0.1)).toEqual({ kind: 'in', door: at(7) });
  });
});

describe('heldLook', () => {
  it('looks at the guest while seen, else at the door', () => {
    const inside: Doorway = { kind: 'in', door: at(3) };
    expect(heldLook(inside, roofed(4))).toEqual(at(4));
    expect(heldLook(inside, hidden)).toEqual(at(3));
    expect(heldLook({ kind: 'in', door: null }, hidden)).toBeNull();
  });
});

describe('holds', () => {
  it('holds at a door and for somebody coming out, never in the open or without a door', () => {
    expect(holds({ kind: 'in', door: at(3) })).toBe(true);
    expect(holds({ kind: 'coming', from: at(0), eye: at(0), seconds: 0 })).toBe(true);
    expect(holds({ kind: 'in', door: null })).toBe(false);
    expect(holds(OUT_OF_SIGHT)).toBe(false);
  });
});
