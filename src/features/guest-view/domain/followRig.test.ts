import { describe, expect, it } from 'vitest';
import {
  CUT_VOXELS,
  GUEST_FRAMING,
  heldRig,
  rigGoal,
  stepRig,
  WATCH_FRAMING,
  type RigState,
  type TargetPose,
  type Vec3,
} from './followRig';
import { STILL_GLANCE } from './glance';

const pose = (at: Vec3, heading = 0, framing = GUEST_FRAMING): TargetPose => ({
  at,
  heading,
  framing,
});

const ORIGIN = { x: 100, y: 0, z: 100 };

const gap = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const expectNear = (a: Vec3, b: Vec3, digits = 6): void => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

describe('rigGoal', () => {
  it('stands third person behind the heading, above the eye and to the right', () => {
    const goal = rigGoal(pose(ORIGIN), 0, 'third', STILL_GLANCE, 0);
    const { behind, above, side, ahead, eye } = GUEST_FRAMING;
    // Facing +z, the right hand is -x.
    expectNear(goal.camera, { x: 100 - side, y: eye + above, z: 100 - behind });
    expectNear(goal.look, { x: 100, y: eye, z: 100 + ahead });
  });

  it('puts first person at the eye, looking along the heading', () => {
    const goal = rigGoal(pose(ORIGIN, Math.PI / 2), Math.PI / 2, 'first', STILL_GLANCE, 0);
    const { eye, eyeAhead } = GUEST_FRAMING;
    expectNear(goal.camera, { x: 100 + eyeAhead, y: eye, z: 100 });
    expect(goal.look.y).toBeCloseTo(eye);
    expect(goal.look.x).toBeGreaterThan(goal.camera.x + 10);
  });

  it('orbits a watch framing at the orbit angle whichever view is asked for', () => {
    const third = rigGoal(pose(ORIGIN, 1, WATCH_FRAMING), 1, 'third', STILL_GLANCE, 0);
    const first = rigGoal(pose(ORIGIN, 1, WATCH_FRAMING), 1, 'first', STILL_GLANCE, 0);
    expect(first).toEqual(third);
    expectNear(third.camera, { x: 100, y: 32, z: 100 + WATCH_FRAMING.behind });
    const later = rigGoal(pose(ORIGIN, 1, WATCH_FRAMING), 1, 'third', STILL_GLANCE, Math.PI / 2);
    expectNear(later.camera, { x: 100 + WATCH_FRAMING.behind, y: 32, z: 100 });
  });
});

describe('stepRig', () => {
  const settled = (at: Vec3, heading = 0): RigState =>
    stepRig(null, pose(at, heading), 'third', STILL_GLANCE, 1, 0);

  it('snaps on the first call', () => {
    const state = settled(ORIGIN);
    const goal = rigGoal(pose(ORIGIN), 0, 'third', STILL_GLANCE, 0);
    expect(state.anchor).toEqual(ORIGIN);
    expectNear(state.camera, goal.camera);
  });

  it('cuts on a jump past CUT_VOXELS and eases a shorter one', () => {
    const start = settled(ORIGIN);
    const far = { ...ORIGIN, x: ORIGIN.x + CUT_VOXELS + 1 };
    const near = { ...ORIGIN, x: ORIGIN.x + CUT_VOXELS - 1 };
    expect(stepRig(start, pose(far), 'third', STILL_GLANCE, 1, 0.016).anchor).toEqual(far);
    const eased = stepRig(start, pose(near), 'third', STILL_GLANCE, 1, 0.016).anchor;
    expect(eased.x).toBeGreaterThan(ORIGIN.x);
    expect(eased.x).toBeLessThan(near.x);
  });

  it('lands in the same place in two steps of dt as in one of 2 dt', () => {
    // Only the camera is off its goal, so every channel eases towards a fixed point.
    const start = {
      ...stepRig(null, pose(ORIGIN), 'first', STILL_GLANCE, 1, 0),
      free: { x: 140, y: 30, z: 60 },
    };
    const once = stepRig(start, pose(ORIGIN), 'first', STILL_GLANCE, 1, 0.2);
    const half = stepRig(start, pose(ORIGIN), 'first', STILL_GLANCE, 1, 0.1);
    const twice = stepRig(half, pose(ORIGIN), 'first', STILL_GLANCE, 1, 0.1);
    expectNear(twice.camera, once.camera);
    expect(twice.orbit).toBeCloseTo(once.orbit, 9);
  });

  it('turns the eyes the shorter way round, across -PI/PI too', () => {
    const eyes = (heading: number): RigState =>
      stepRig(null, pose(ORIGIN, heading), 'first', STILL_GLANCE, 1, 0);
    const turned = stepRig(eyes(0.1), pose(ORIGIN, -0.2), 'first', STILL_GLANCE, 1, 0.1);
    expect(turned.yaw).toBeLessThan(0.1);
    expect(turned.yaw).toBeGreaterThan(-0.2);
    const across = stepRig(
      eyes(Math.PI - 0.1),
      pose(ORIGIN, -Math.PI + 0.1),
      'first',
      STILL_GLANCE,
      1,
      0.1,
    );
    expect(across.yaw).toBeGreaterThan(Math.PI - 0.1);
    expect(across.yaw).toBeLessThan(Math.PI + 0.1);
  });

  it('keeps a third-person camera where it is for a guest turning on the spot', () => {
    let state = settled(ORIGIN);
    const before = state.camera;
    for (let frame = 0; frame < 10; frame++) {
      state = stepRig(state, pose(ORIGIN, Math.PI), 'third', STILL_GLANCE, 1, 1 / 60);
    }
    expect(gap(state.camera, before)).toBeLessThan(1);
  });

  it('brings a third-person camera round behind a guest who walks on', () => {
    let state = settled(ORIGIN);
    let at = ORIGIN;
    for (let frame = 1; frame <= 600; frame++) {
      at = { x: ORIGIN.x + frame * 0.2, y: ORIGIN.y, z: ORIGIN.z };
      state = stepRig(state, pose(at, Math.PI / 2), 'third', STILL_GLANCE, 1, 1 / 60);
    }
    // Walking along +x, behind is -x.
    expect(state.camera.x).toBeLessThan(at.x - GUEST_FRAMING.behind * 0.8);
    expect(Math.abs(state.camera.z - at.z)).toBeLessThan(GUEST_FRAMING.behind * 0.3);
  });

  it('pulls the camera in to the clear share, never nearer than 4 voxels', () => {
    const goal = rigGoal(pose(ORIGIN), 0, 'third', STILL_GLANCE, 0);
    const ducked = stepRig(null, pose(ORIGIN), 'third', STILL_GLANCE, 0.25, 0);
    expect(gap(ducked.camera, goal.look)).toBeCloseTo(gap(goal.camera, goal.look) * 0.25);
    const walled = stepRig(null, pose(ORIGIN), 'third', STILL_GLANCE, 0, 0);
    expect(gap(walled.camera, goal.look)).toBeCloseTo(4);
  });

  it('ducks in fast and comes out slowly', () => {
    const open = settled(ORIGIN);
    const ducking = stepRig(open, pose(ORIGIN), 'third', STILL_GLANCE, 0.25, 0.1);
    expect(ducking.reach).toBeLessThan(0.35);
    const coming = stepRig({ ...open, reach: 0.25 }, pose(ORIGIN), 'third', STILL_GLANCE, 1, 0.1);
    expect(coming.reach).toBeLessThan(0.4);
  });

  it('holds the camera still while turning it to a point, and takes no time to stand still', () => {
    const start = settled(ORIGIN);
    const door = { x: 140, y: 6, z: 140 };
    const held = heldRig(start, door, 0.3);
    expect(held.camera).toEqual(start.camera);
    expect(gap(held.look, door)).toBeCloseTo(gap(start.look, door) / 2);
    expect(heldRig(start, null, 0.3).look).toEqual(start.look);
    expect(heldRig(start, door, 0)).toBe(start);
  });

  it('changes nothing for a step of no time, negative time or NaN', () => {
    const start = settled(ORIGIN);
    const moved = pose({ ...ORIGIN, x: 120 }, 1);
    for (const dt of [0, -0.1, Number.NaN]) {
      expect(stepRig(start, moved, 'third', STILL_GLANCE, 0.5, dt)).toBe(start);
    }
  });
});
