import { describe, expect, it } from 'vitest';
import { SIM_SPEEDS } from '../../sim/domain/simClock';
import type { CameraSnapshot } from '../../saves/domain/snapshot';
import {
  cappedSpeed,
  followMove,
  pickedWhileFollowing,
  rideLabel,
  sameFollowView,
  type FollowView,
  shiftedCamera,
  speedAfterFollowing,
} from './followRules';

describe('followMove', () => {
  it('selects as before while nothing is followed', () => {
    for (const picked of [{ person: 3 }, null, { key: 'hotel@1,1' }]) {
      expect(followMove(false, picked)).toEqual({ stop: false, select: true, hop: null });
    }
  });

  it('hops to another guest, stops on nothing, and stops to inspect anything else', () => {
    expect(followMove(true, { person: 3 })).toEqual({ stop: false, select: true, hop: 3 });
    expect(followMove(true, null)).toEqual({ stop: true, select: false, hop: null });
    expect(followMove(true, { worker: 2 })).toEqual({ stop: true, select: true, hop: null });
    expect(followMove(true, { key: 'hotel@1,1' })).toEqual({ stop: true, select: true, hop: null });
  });
});

describe('cappedSpeed', () => {
  it('caps anything past Slow at Slow and remembers it', () => {
    const capped = Object.fromEntries(SIM_SPEEDS.map((speed) => [speed, cappedSpeed(speed)]));
    expect(capped).toEqual({
      paused: { speed: 'paused', remembered: null },
      slow: { speed: 'slow', remembered: null },
      normal: { speed: 'slow', remembered: 'normal' },
      fast: { speed: 'slow', remembered: 'fast' },
      rush: { speed: 'slow', remembered: 'rush' },
    });
  });

  it('caps a speed picked while following, unpausing too, and remembers it for after', () => {
    expect(pickedWhileFollowing(null, 'normal')).toEqual({ speed: 'slow', remembered: 'normal' });
    expect(pickedWhileFollowing('fast', 'rush')).toEqual({ speed: 'slow', remembered: 'rush' });
    expect(pickedWhileFollowing('fast', 'paused')).toEqual({ speed: 'paused', remembered: 'fast' });
    expect(pickedWhileFollowing('fast', 'slow')).toEqual({ speed: 'slow', remembered: 'fast' });
  });

  it('goes back to the remembered speed only from Slow', () => {
    expect(speedAfterFollowing('fast', 'slow')).toBe('fast');
    expect(speedAfterFollowing('fast', 'paused')).toBeNull();
    expect(speedAfterFollowing(null, 'slow')).toBeNull();
  });
});

describe('shiftedCamera', () => {
  it('moves the target to the ground and keeps the offset to the position', () => {
    const before: CameraSnapshot = {
      mode: 'isometric',
      isoDirection: 'northwest',
      target: { x: 10, y: 0, z: 10 },
      position: { x: 60, y: 80, z: 70 },
      zoom: 2,
    };
    expect(shiftedCamera(before, { x: 110, y: 4, z: 30 })).toEqual({
      mode: 'isometric',
      isoDirection: 'northwest',
      target: { x: 110, y: 4, z: 30 },
      position: { x: 160, y: 84, z: 90 },
      zoom: 2,
    });
  });
});

describe('sameFollowView', () => {
  const view: FollowView = {
    guest: 3,
    riding: null,
    view: 'third',
    firstPerson: true,
    rideOffered: false,
    left: false,
  };

  it('tells a change of any field, and nothing from an equal copy', () => {
    expect(sameFollowView(view, { ...view })).toBe(true);
    expect(sameFollowView(view, { ...view, left: true })).toBe(false);
    expect(sameFollowView(view, { ...view, riding: 'Jet Ski' })).toBe(false);
    expect(sameFollowView(view, null)).toBe(false);
    expect(sameFollowView(null, null)).toBe(true);
  });
});

describe('rideLabel', () => {
  it('names the only one of a kind with the, and any other with a or an', () => {
    expect(rideLabel('Banana Boat', true)).toBe('Ride the Banana Boat');
    expect(rideLabel('Pedal Boat', false)).toBe('Ride a Pedal Boat');
    expect(rideLabel('Inflatable', false)).toBe('Ride an Inflatable');
  });
});
