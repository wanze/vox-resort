import { ADULT_VOXELS, CHILD_VOXELS } from '../../../../voxel-gen/people/figure.ts';
import type { Glance } from './glance';

// Every number in this block is a tuning constant, in world voxels (4 to a metre) and seconds.
const SHOULDER = { behind: 14, above: 3, side: 2, ahead: 6 } as const;
// Half a voxel under the top of the head, and as far forward of the body's middle.
const EYE_BELOW_TOP = 0.5;
const EYE_AHEAD = 0.5;
const FIRST_PERSON_REACH = 20;
const WATCH = { out: 48, up: 32, eye: 8 } as const;
const WATCH_TURN_PER_SECOND = 0.15;
const CRAFT = { behindPerRadius: 2.5, behind: 12, eye: 5, above: 3, bowPerRadius: 0.6 } as const;
const HALF_LIFE = {
  anchor: 0.15,
  yaw: { third: 0.45, first: 0.25 },
  // How slowly a trailing camera comes round behind the heading.
  leash: 1.2,
  hold: 0.3,
  camera: { third: 0.2, first: 0.05 },
  duck: 0.03,
  unduck: 0.5,
} as const;
// A ride hop or a body taken off the plot: the camera snaps rather than flies through buildings.
export const CUT_VOXELS = 64;
const NEAREST_PULL = 4;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type ViewMode = 'third' | 'first';

export interface Framing {
  readonly behind: number;
  readonly above: number;
  readonly side: number;
  readonly ahead: number;
  readonly eye: number;
  readonly eyeAhead: number;
  readonly watch: boolean;
}

export const GUEST_FRAMING: Framing = {
  ...SHOULDER,
  eye: ADULT_VOXELS - EYE_BELOW_TOP,
  eyeAhead: EYE_AHEAD,
  watch: false,
};

export const CHILD_FRAMING: Framing = { ...GUEST_FRAMING, eye: CHILD_VOXELS - EYE_BELOW_TOP };

export const WATCH_FRAMING: Framing = {
  behind: WATCH.out,
  above: WATCH.up - WATCH.eye,
  side: 0,
  ahead: 0,
  eye: WATCH.eye,
  eyeAhead: 0,
  watch: true,
};

// First person is a bow camera: every seat aboard has a passenger drawn in it.
export function craftFraming(radius: number): Framing {
  return {
    behind: CRAFT.behindPerRadius * radius + CRAFT.behind,
    above: CRAFT.above,
    side: 0,
    ahead: radius,
    eye: CRAFT.eye,
    eyeAhead: CRAFT.bowPerRadius * radius,
    watch: false,
  };
}

// `at` is where the target stands: a guest's feet, a hull's waterline.
export interface TargetPose {
  readonly at: Vec3;
  readonly heading: number;
  readonly framing: Framing;
}

export interface RigState {
  readonly anchor: Vec3;
  readonly yaw: number;
  // Where the camera would be with nothing in the way; `camera` is pulled in from it by `reach`.
  readonly free: Vec3;
  readonly reach: number;
  readonly camera: Vec3;
  readonly look: Vec3;
  readonly orbit: number;
}

const TURN = Math.PI * 2;

const forwardOf = (yaw: number): Vec3 => ({ x: Math.sin(yaw), y: 0, z: Math.cos(yaw) });

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => ({
  x: a.x + b.x * scale,
  y: a.y + b.y * scale,
  z: a.z + b.z * scale,
});

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Positive pitch raises the camera over the look point, as a downward drag of the orbit controls does.
function tilted(look: Vec3, camera: Vec3, pitch: number): Vec3 {
  const dx = camera.x - look.x;
  const dz = camera.z - look.z;
  const flat = Math.hypot(dx, dz);
  const length = Math.hypot(flat, camera.y - look.y);
  if (length === 0) return camera;
  const limit = Math.PI / 2 - 0.05;
  const elevation = Math.min(limit, Math.max(-limit, Math.atan2(camera.y - look.y, flat) + pitch));
  const across = flat === 0 ? 0 : (length * Math.cos(elevation)) / flat;
  return {
    x: look.x + dx * across,
    y: look.y + length * Math.sin(elevation),
    z: look.z + dz * across,
  };
}

function watchGoal(pose: TargetPose, glance: Glance, orbit: number): { camera: Vec3; look: Vec3 } {
  const { framing } = pose;
  const look = add(pose.at, { x: 0, y: framing.eye, z: 0 });
  const out = forwardOf(orbit);
  const camera = add(add(look, out, framing.behind * glance.zoom), {
    x: 0,
    y: framing.above,
    z: 0,
  });
  return { camera, look };
}

function firstGoal(pose: TargetPose, yaw: number, glance: Glance): { camera: Vec3; look: Vec3 } {
  const { framing } = pose;
  const forward = forwardOf(yaw + glance.yaw);
  const camera = add(add(pose.at, { x: 0, y: framing.eye, z: 0 }), forward, framing.eyeAhead);
  const reach = framing.eyeAhead + FIRST_PERSON_REACH;
  const look = {
    x: camera.x + forward.x * reach * Math.cos(glance.pitch),
    y: camera.y - reach * Math.sin(glance.pitch),
    z: camera.z + forward.z * reach * Math.cos(glance.pitch),
  };
  return { camera, look };
}

function thirdGoal(pose: TargetPose, yaw: number, glance: Glance): { camera: Vec3; look: Vec3 } {
  const { framing } = pose;
  const forward = forwardOf(yaw);
  const eye = add(pose.at, { x: 0, y: framing.eye, z: 0 });
  const look = add(eye, forward, framing.ahead);
  const around = forwardOf(yaw + glance.yaw);
  const right = { x: -around.z, y: 0, z: around.x };
  const behind = add(add(eye, around, -framing.behind * glance.zoom), right, framing.side);
  const raised = add(behind, { x: 0, y: framing.above, z: 0 });
  return { camera: tilted(look, raised, glance.pitch), look };
}

export function rigGoal(
  pose: TargetPose,
  yaw: number,
  view: ViewMode,
  glance: Glance,
  orbit: number,
): { readonly camera: Vec3; readonly look: Vec3 } {
  if (pose.framing.watch) return watchGoal(pose, glance, orbit);
  return view === 'first' ? firstGoal(pose, yaw, glance) : thirdGoal(pose, yaw, glance);
}

// Never nearer than NEAREST_PULL, unless the camera was nearer than that to begin with.
function pulledIn(look: Vec3, free: Vec3, reach: number): Vec3 {
  const length = distance(look, free);
  if (length <= NEAREST_PULL) return free;
  const share = Math.max(Math.min(reach, 1), NEAREST_PULL / length);
  return add(look, { x: free.x - look.x, y: free.y - look.y, z: free.z - look.z }, share);
}

const eased = (current: number, goal: number, dt: number, halfLife: number): number =>
  goal + (current - goal) * 2 ** (-dt / halfLife);

const easedVec = (current: Vec3, goal: Vec3, dt: number, halfLife: number): Vec3 => ({
  x: eased(current.x, goal.x, dt, halfLife),
  y: eased(current.y, goal.y, dt, halfLife),
  z: eased(current.z, goal.z, dt, halfLife),
});

// Along the shorter arc, so a turn across -PI/PI does not swing the long way round.
function easedAngle(current: number, goal: number, dt: number, halfLife: number): number {
  const gap = ((((goal - current) % TURN) + TURN * 1.5) % TURN) - Math.PI;
  return current + gap - gap * 2 ** (-dt / halfLife);
}

function snapped(
  pose: TargetPose,
  view: ViewMode,
  glance: Glance,
  reach: number,
  orbit: number,
): RigState {
  const goal = rigGoal(pose, pose.heading, view, glance, orbit);
  return {
    anchor: pose.at,
    yaw: pose.heading,
    free: goal.camera,
    reach,
    camera: pulledIn(goal.look, goal.camera, reach),
    look: goal.look,
    orbit,
  };
}

// Third person trails the target as if on a leash: the camera keeps its bearing and only comes round
// behind the heading slowly, so a guest who zigzags or turns on the spot does not swing it about.
function trailedYaw(
  previous: RigState,
  pose: TargetPose,
  view: ViewMode,
  glance: Glance,
  dt: number,
): number {
  const { framing } = pose;
  const dx = previous.anchor.x - previous.free.x;
  const dz = previous.anchor.z - previous.free.z;
  if (view === 'first' || framing.watch || Math.hypot(dx, dz) < 1) {
    return easedAngle(previous.yaw, pose.heading, dt, HALF_LIFE.yaw[view]);
  }
  // The bearing to the target, less the look-around and the shoulder the camera sits off.
  const offset = Math.atan2(framing.side, framing.behind * glance.zoom);
  const bearing = Math.atan2(dx, dz) - glance.yaw - offset;
  return easedAngle(bearing, pose.heading, dt, HALF_LIFE.leash);
}

// While the target is indoors, or not yet clear of the door, the camera stays where it stands and
// only turns: to `look`, or nowhere for null.
export function heldRig(previous: RigState, look: Vec3 | null, dt: number): RigState {
  if (!(dt > 0)) return previous;
  const turned = look ? easedVec(previous.look, look, dt, HALF_LIFE.hold) : previous.look;
  return { ...previous, free: previous.camera, reach: 1, look: turned };
}

// `reach` is the share of the way from the look point to the camera that is clear, 1 for all of it.
export function stepRig(
  previous: RigState | null,
  pose: TargetPose,
  view: ViewMode,
  glance: Glance,
  reach: number,
  dt: number,
): RigState {
  if (previous === null) return snapped(pose, view, glance, reach, pose.heading);
  if (!(dt > 0)) return previous;
  const orbit = previous.orbit + WATCH_TURN_PER_SECOND * dt;
  if (distance(previous.anchor, pose.at) > CUT_VOXELS) {
    return snapped(pose, view, glance, reach, orbit);
  }
  const anchor = easedVec(previous.anchor, pose.at, dt, HALF_LIFE.anchor);
  const yaw = trailedYaw(previous, pose, view, glance, dt);
  const goal = rigGoal({ ...pose, at: anchor }, yaw, view, glance, orbit);
  const free = easedVec(previous.free, goal.camera, dt, HALF_LIFE.camera[view]);
  const ducking = reach < previous.reach;
  const held = eased(previous.reach, reach, dt, ducking ? HALF_LIFE.duck : HALF_LIFE.unduck);
  return {
    anchor,
    yaw,
    free,
    reach: held,
    camera: pulledIn(goal.look, free, held),
    look: goal.look,
    orbit,
  };
}
