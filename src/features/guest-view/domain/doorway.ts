import type { Vec3 } from './followRig';

// Whichever comes first lets the camera go after somebody coming out: walked this far from where
// they came out, or this many real seconds.
const CLEAR_OF_DOOR_VOXELS = 32;
const CLEAR_OF_DOOR_SECONDS = 4;

// `eye` is where the guest's eyes were last seen in the open; `door` where they went in, null for
// somebody already inside when the follow began.
export type Doorway =
  | { readonly kind: 'out'; readonly eye: Vec3 | null }
  | { readonly kind: 'in'; readonly door: Vec3 | null }
  | { readonly kind: 'coming'; readonly from: Vec3; readonly eye: Vec3; readonly seconds: number };

export const OUT_OF_SIGHT: Doorway = { kind: 'out', eye: null };

export interface Glimpse {
  // Out of sight, or under a roof: indoors either way.
  readonly inside: boolean;
  // Null while out of sight.
  readonly eye: Vec3 | null;
  // Whether the guest can be seen from where the camera stands.
  readonly clear: boolean;
}

const walked = (from: Vec3, to: Vec3): number => Math.hypot(to.x - from.x, to.z - from.z);

function comingOut(state: Doorway & { kind: 'coming' }, eye: Vec3, glimpse: Glimpse, dt: number) {
  const seconds = state.seconds + dt;
  const out =
    glimpse.clear ||
    walked(state.from, eye) > CLEAR_OF_DOOR_VOXELS ||
    seconds > CLEAR_OF_DOOR_SECONDS;
  return out ? { kind: 'out' as const, eye } : { ...state, eye, seconds };
}

function lastEye(state: Doorway): Vec3 | null {
  if (state.kind === 'in') return state.door;
  return state.eye;
}

// Out of the open into a building the camera stops at the door, and back out it waits until the
// guest is clear of it, rather than following through the walls.
export function nextDoorway(state: Doorway, glimpse: Glimpse, dt: number): Doorway {
  const { eye } = glimpse;
  if (glimpse.inside || eye === null) return { kind: 'in', door: lastEye(state) };
  if (state.kind === 'in') return { kind: 'coming', from: eye, eye, seconds: 0 };
  if (state.kind === 'coming') return comingOut(state, eye, glimpse, dt);
  return { kind: 'out', eye };
}

// Where the held camera looks: at the guest while they can be seen, else at the door they went in.
export function heldLook(state: Doorway, glimpse: Glimpse): Vec3 | null {
  return glimpse.eye ?? lastEye(state);
}

// Somebody inside from the start has no door to stand at, so the camera watches from its orbit.
export const holds = (state: Doorway): boolean =>
  state.kind === 'coming' || (state.kind === 'in' && state.door !== null);
