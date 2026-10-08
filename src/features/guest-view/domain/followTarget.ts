import { SHOWN } from '../../choreography/domain/casting';
import { RESTING } from '../../crowd/domain/crowd';
import { poseOf, type Flotilla } from '../../sea/domain/flotilla';
import {
  CHILD_FRAMING,
  craftFraming,
  GUEST_FRAMING,
  WATCH_FRAMING,
  type Framing,
  type TargetPose,
  type ViewMode,
} from './followRig';
import { craftOut } from './rides';

// By party as well as person: a person index is a mesh body the next party to check in reuses.
export type FollowTarget =
  | { readonly kind: 'guest'; readonly person: number; readonly party: number }
  | { readonly kind: 'craft'; readonly craft: number };

// `firstPerson` is false for somebody lying down, whose eyes see only the sky.
export type Sighting =
  | { readonly kind: 'seen'; readonly pose: TargetPose; readonly firstPerson: boolean }
  | { readonly kind: 'hidden'; readonly pose: TargetPose }
  | { readonly kind: 'gone' };

interface Positions {
  readonly x: ArrayLike<number>;
  readonly y: ArrayLike<number>;
  readonly z: ArrayLike<number>;
  readonly heading: ArrayLike<number>;
}

// Typed by shape, so following never reaches into the router or the sim.
export interface GuestSources {
  readonly crowd: Positions & { readonly offPlot: ArrayLike<number> };
  readonly drawn: Positions & {
    readonly shown: ArrayLike<number>;
    readonly pose: ArrayLike<number>;
  };
  readonly guests: {
    readonly present: ArrayLike<number>;
    readonly party: ArrayLike<number>;
    readonly child: ArrayLike<number>;
  };
  readonly resting: (person: number) => number;
}

// How much lower a seated figure's eyes are than a standing one's.
const SITTING_DROP = 2;

const GONE: Sighting = { kind: 'gone' };

const poseAt = (from: Positions, person: number, framing: Framing): TargetPose => ({
  at: { x: from.x[person]!, y: from.y[person]!, z: from.z[person]! },
  heading: from.heading[person]!,
  framing,
});

export function guestSighting(
  sources: GuestSources,
  target: { readonly person: number; readonly party: number },
): Sighting {
  const { crowd, drawn, guests } = sources;
  const { person } = target;
  if (guests.present[person] !== 1 || guests.party[person] !== target.party) return GONE;
  const shown = drawn.shown[person] ?? SHOWN.asCrowd;
  if (crowd.offPlot[person] === 1 || shown === SHOWN.hidden) {
    return { kind: 'hidden', pose: poseAt(crowd, person, WATCH_FRAMING) };
  }
  const placed = shown === SHOWN.placed;
  // A drawn pose may carry its progress after the point.
  const resting = Math.floor(placed ? drawn.pose[person]! : sources.resting(person));
  const body = guests.child[person] === 1 ? CHILD_FRAMING : GUEST_FRAMING;
  const framing = resting === RESTING.sitting ? { ...body, eye: body.eye - SITTING_DROP } : body;
  return {
    kind: 'seen',
    pose: poseAt(placed ? drawn : crowd, person, framing),
    firstPerson: resting !== RESTING.lying,
  };
}

export function craftSighting(flotilla: Flotilla, craft: number, buoyVariant: number): Sighting {
  if (!craftOut(flotilla, craft, buoyVariant)) return GONE;
  const pose = poseOf(flotilla, craft);
  return {
    kind: 'seen',
    pose: {
      at: { x: pose.x, y: pose.y, z: pose.z },
      heading: pose.heading,
      framing: craftFraming(flotilla.radius[craft]!),
    },
    firstPerson: true,
  };
}

export interface Look {
  readonly view: ViewMode;
  readonly firstPerson: boolean;
  // The body left out of the drawing, so a guest's own head is never in their way.
  readonly hidden: number | null;
  // Whether walls in the way pull the camera in; a watch orbit is high enough to clear them.
  readonly occluded: boolean;
}

// `eyes` is the guest looked out of in first person, null on a craft, whose camera is at the bow.
export function lookOf(sighting: Sighting, chosen: ViewMode, eyes: number | null): Look {
  const seen = sighting.kind === 'seen';
  const firstPerson = seen && sighting.firstPerson;
  const view = firstPerson ? chosen : 'third';
  return {
    view,
    firstPerson,
    hidden: view === 'first' ? eyes : null,
    occluded: view === 'third' && seen,
  };
}
