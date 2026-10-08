import type { InspectTarget } from '../../inspect/domain/selection';
import type { CameraSnapshot } from '../../saves/domain/snapshot';
import type { SimSpeed } from '../../sim/domain/simClock';
import type { Vec3, ViewMode } from './followRig';

export interface FollowMove {
  readonly stop: boolean;
  readonly select: boolean;
  // The guest to follow instead, or null to follow nobody new.
  readonly hop: number | null;
}

const STOP_ONLY: FollowMove = { stop: true, select: false, hop: null };

// A click on nothing stops following but leaves the guest's panel open; the next one closes it.
export function followMove(following: boolean, picked: InspectTarget): FollowMove {
  if (!following) return { stop: false, select: true, hop: null };
  if (picked === null) return STOP_ONLY;
  if ('person' in picked) return { stop: false, select: true, hop: picked.person };
  return { stop: true, select: true, hop: null };
}

export interface CappedSpeed {
  readonly speed: SimSpeed;
  readonly remembered: SimSpeed | null;
}

// Slow still jogs the crowd at 3.6 times walking pace; anything faster blurs the view.
export function cappedSpeed(speed: SimSpeed): CappedSpeed {
  if (speed === 'paused' || speed === 'slow') return { speed, remembered: null };
  return { speed: 'slow', remembered: speed };
}

// A speed picked while following is capped too, unpausing included, and comes back after it.
export function pickedWhileFollowing(remembered: SimSpeed | null, picked: SimSpeed): CappedSpeed {
  const capped = cappedSpeed(picked);
  return { speed: capped.speed, remembered: capped.remembered ?? remembered };
}

// Null leaves the clock alone: the player has picked another speed or paused since.
export function speedAfterFollowing(remembered: SimSpeed | null, now: SimSpeed): SimSpeed | null {
  return remembered !== null && now === 'slow' ? remembered : null;
}

// The player's own camera, moved along so it looks at where the followed target ended up.
export function shiftedCamera(snapshot: CameraSnapshot, ground: Vec3): CameraSnapshot {
  const dx = ground.x - snapshot.target.x;
  const dy = ground.y - snapshot.target.y;
  const dz = ground.z - snapshot.target.z;
  return {
    ...snapshot,
    target: { x: ground.x, y: ground.y, z: ground.z },
    position: {
      x: snapshot.position.x + dx,
      y: snapshot.position.y + dy,
      z: snapshot.position.z + dz,
    },
  };
}

// What the follow card shows; told to the HUD only when it changes, never per frame.
export interface FollowView {
  readonly guest: number | null;
  // The craft ridden, by its model's label; null on foot.
  readonly riding: string | null;
  readonly view: ViewMode;
  // False while the guest lies down or is out of sight, so the card offers no eyes to look through.
  readonly firstPerson: boolean;
  readonly rideOffered: boolean;
  readonly left: boolean;
}

export function sameFollowView(a: FollowView | null, b: FollowView | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.guest === b.guest &&
    a.riding === b.riding &&
    a.view === b.view &&
    a.firstPerson === b.firstPerson &&
    a.rideOffered === b.rideOffered &&
    a.left === b.left
  );
}

export interface RideCommand {
  readonly craft: number;
  readonly label: string;
}

// "The" for the only one of its kind on the water, as a hut's one banana boat is.
export function rideLabel(label: string, only: boolean): string {
  if (only) return `Ride the ${label}`;
  return `Ride ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;
}
