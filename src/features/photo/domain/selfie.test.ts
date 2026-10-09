import { describe, expect, it } from 'vitest';
import { SHOWN, type DrawnAs } from '../../choreography/domain/casting';
import {
  canSelfie,
  drawnStanding,
  holdSelfie,
  releaseSelfie,
  SELFIE_DISTANCE,
  SELFIE_LIFT,
  selfiePose,
} from './selfie';

const EYE = 6.5;

const drawnOf = (count: number): DrawnAs => ({
  shown: new Uint8Array(count),
  x: new Float32Array(count),
  y: new Float32Array(count),
  z: new Float32Array(count),
  heading: new Float32Array(count),
  pose: new Float32Array(count),
  chair: new Uint8Array(count),
});

const crowdOf = (count: number) => ({
  x: Float32Array.from({ length: count }, (_unused, index) => 100 + index),
  y: new Float32Array(count).fill(2),
  z: Float32Array.from({ length: count }, (_unused, index) => 50 + index),
  heading: new Float32Array(count).fill(0.5),
});

const guest = { x: 40, y: 2, z: 60, heading: Math.PI / 2 };

const flatDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('selfiePose', () => {
  it('stands the camera a selfie stick away, looking at the face', () => {
    const { pose, heading } = selfiePose(guest, EYE, null, 55);
    expect(flatDistance(pose.position, guest)).toBeCloseTo(SELFIE_DISTANCE);
    expect(pose.target).toEqual({ x: guest.x, y: guest.y + EYE, z: guest.z });
    expect(pose.position.y).toBeCloseTo(guest.y + EYE + SELFIE_LIFT);
    expect(pose.fov).toBe(55);
    expect(heading).toBe(guest.heading);
  });

  it('stands in front of the guest without a sun to put behind them', () => {
    const { pose } = selfiePose(guest, EYE, null, 55);
    expect(pose.position.x).toBeCloseTo(guest.x + SELFIE_DISTANCE);
    expect(pose.position.z).toBeCloseTo(guest.z);
  });

  it('stands on the far side from the sun and turns the guest to face the camera', () => {
    const sun = { x: -0.9, y: 0.1, z: 0.42 };
    const { pose, heading } = selfiePose(guest, EYE, sun, 55);
    const toCamera = { x: pose.position.x - guest.x, z: pose.position.z - guest.z };
    expect(toCamera.x * sun.x + toCamera.z * sun.z).toBeLessThan(0);
    expect(flatDistance(pose.position, guest)).toBeCloseTo(SELFIE_DISTANCE);
    expect(Math.sin(heading)).toBeCloseTo(toCamera.x / SELFIE_DISTANCE);
    expect(Math.cos(heading)).toBeCloseTo(toCamera.z / SELFIE_DISTANCE);
  });

  it('falls back to the guest’s facing under a sun straight overhead', () => {
    const overhead = selfiePose(guest, EYE, { x: 0.01, y: 0.9999, z: 0.01 }, 55);
    const plain = selfiePose(guest, EYE, null, 55);
    expect(overhead.pose.position.x).toBeCloseTo(plain.pose.position.x);
    expect(overhead.pose.position.z).toBeCloseTo(plain.pose.position.z);
  });
});

describe('holdSelfie', () => {
  it('puts back a guest the crowd was drawing, exactly as they were', () => {
    const drawn = drawnOf(3);
    const crowd = crowdOf(3);
    const before = structuredClone(drawn);
    const at = { ...drawnStanding(drawn, crowd, 1), heading: 2 };
    expect(at).toEqual({ x: 101, y: 2, z: 51, heading: 2 });
    const held = holdSelfie(drawn, 1, at, 11);
    expect(drawn.shown[1]).toBe(SHOWN.placed);
    expect(drawn.x[1]).toBe(101);
    expect(drawn.pose[1]).toBe(11);
    releaseSelfie(drawn, held);
    expect(drawn).toEqual(before);
  });

  it('puts back a placed guest, exactly as they were', () => {
    const drawn = drawnOf(2);
    drawn.shown[0] = SHOWN.placed;
    drawn.x[0] = 7;
    drawn.y[0] = 3;
    drawn.z[0] = 9;
    drawn.pose[0] = 2;
    const before = structuredClone(drawn);
    const at = drawnStanding(drawn, crowdOf(2), 0);
    expect(at.x).toBe(7);
    const held = holdSelfie(drawn, 0, { ...at, heading: 1 }, 11);
    releaseSelfie(drawn, held);
    expect(drawn).toEqual(before);
  });
});

describe('canSelfie', () => {
  it('refuses a guest who is not drawn', () => {
    const drawn = drawnOf(2);
    drawn.shown[1] = SHOWN.hidden;
    expect(canSelfie(drawn, false, 0)).toBe(true);
    expect(canSelfie(drawn, false, 1)).toBe(false);
    expect(canSelfie(drawn, true, 0)).toBe(false);
  });
});
