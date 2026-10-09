import type { Vector3 } from '../../lighting/domain/dayNight';
import { SHOWN, type DrawnAs } from '../../choreography/domain/casting';
import type { CameraPose } from './photoView';

// A selfie stick rather than an arm: at arm's length the near plane, up to 4 voxels on a large
// plot, would cut the face.
export const SELFIE_DISTANCE = 10;
export const SELFIE_LIFT = 1;

// Under this much horizontal reach the sun gives no side to stand on.
const OVERHEAD_SUN = 0.05;

export interface Standing {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

export interface Selfie {
  readonly pose: CameraPose;
  readonly heading: number;
}

// The figure faces +z at heading 0, as crowd.ts turns it with atan2(dx, dz).
function cameraSide(guest: Standing, sunBehind: Vector3 | null): { x: number; z: number } {
  const reach = sunBehind ? Math.hypot(sunBehind.x, sunBehind.z) : 0;
  if (!sunBehind || reach < OVERHEAD_SUN) {
    return { x: Math.sin(guest.heading), z: Math.cos(guest.heading) };
  }
  return { x: -sunBehind.x / reach, z: -sunBehind.z / reach };
}

export function selfiePose(
  guest: Standing,
  eyeHeight: number,
  sunBehind: Vector3 | null,
  fov: number,
): Selfie {
  const side = cameraSide(guest, sunBehind);
  const face = { x: guest.x, y: guest.y + eyeHeight, z: guest.z };
  const position = {
    x: face.x + side.x * SELFIE_DISTANCE,
    y: face.y + SELFIE_LIFT,
    z: face.z + side.z * SELFIE_DISTANCE,
  };
  const heading = sunBehind === null ? guest.heading : Math.atan2(side.x, side.z);
  return { pose: { position, target: face, fov }, heading };
}

interface Positions {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  readonly heading: ArrayLike<number>;
}

export interface HeldSelfie {
  readonly person: number;
  readonly shown: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pose: number;
}

export function canSelfie(
  drawn: Pick<DrawnAs, 'shown'>,
  offPlot: boolean,
  person: number,
): boolean {
  return !offPlot && drawn.shown[person] !== SHOWN.hidden;
}

export function drawnStanding(drawn: DrawnAs, crowd: Positions, person: number): Standing {
  const from = drawn.shown[person] === SHOWN.placed ? drawn : crowd;
  return {
    x: from.x[person]!,
    y: from.y[person]!,
    z: from.z[person]!,
    heading: from.heading[person]!,
  };
}

// Written each frame after the choreography and before the crowd draws, from where they stood when
// the selfie began, so nothing the choreography does in between moves them.
export function holdSelfie(drawn: DrawnAs, person: number, at: Standing, pose: number): HeldSelfie {
  const held: HeldSelfie = {
    person,
    shown: drawn.shown[person]!,
    x: drawn.x[person]!,
    y: drawn.y[person]!,
    z: drawn.z[person]!,
    heading: drawn.heading[person]!,
    pose: drawn.pose[person]!,
  };
  drawn.shown[person] = SHOWN.placed;
  drawn.x[person] = at.x;
  drawn.y[person] = at.y;
  drawn.z[person] = at.z;
  drawn.heading[person] = at.heading;
  drawn.pose[person] = pose;
  return held;
}

export function releaseSelfie(drawn: DrawnAs, held: HeldSelfie): void {
  const { person } = held;
  drawn.shown[person] = held.shown;
  drawn.x[person] = held.x;
  drawn.y[person] = held.y;
  drawn.z[person] = held.z;
  drawn.heading[person] = held.heading;
  drawn.pose[person] = held.pose;
}
