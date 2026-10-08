import { hireOf, SEA_MODELS, solidTopsById } from '../features/catalog/domain/objectTypes';
import { restingOn } from '../features/crowd/domain/crowd';
import { levelHeight } from '../features/layout/domain/elevation';
import { fleetHutKeys } from '../features/sea/domain/fleets';
import type { SeaField } from '../features/sea/adapters/seaField';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import type { BenchConfig } from '../features/bench/domain/benchConfig';
import type { InspectTarget } from '../features/inspect/domain/selection';
import type { CameraSnapshot } from '../features/saves/domain/snapshot';
import type { SimSpeed } from '../features/sim/domain/simClock';
import { createFollowCamera, type ReachOf } from '../features/guest-view/adapters/followCamera';
import type { TargetPose, Vec3, ViewMode } from '../features/guest-view/domain/followRig';
import {
  craftSighting,
  guestSighting,
  lookOf,
  type FollowTarget,
  type GuestSources,
  type Sighting,
} from '../features/guest-view/domain/followTarget';
import {
  cappedSpeed,
  followMove,
  pickedWhileFollowing,
  rideLabel,
  sameFollowView,
  shiftedCamera,
  speedAfterFollowing,
  type FollowView,
  type RideCommand,
} from '../features/guest-view/domain/followRules';
import { benchGuest, hutRide, rideOffers } from '../features/guest-view/domain/rides';
import {
  clearShare,
  roofOver,
  skylineOf,
  type Skyline,
} from '../features/guest-view/domain/sightLine';
import {
  heldLook,
  holds,
  nextDoorway,
  OUT_OF_SIGHT,
  type Doorway,
  type Glimpse,
} from '../features/guest-view/domain/doorway';
import { BUOY_INDEX } from '../../voxel-gen/sea/index.ts';
import { cameraOf, restoreCamera } from './resortLifecycle';
import type { Resort } from './showcase';

// Real seconds the camera holds on where a guest was before following ends.
const LEFT_HOLD_SECONDS = 3;

// Seen from the camera with this share of the line clear, a guest coming out is clear of the door.
const SEEN_SHARE = 0.99;

interface GuestViewParts {
  readonly handle: SceneHandle;
  readonly canvas: HTMLCanvasElement;
  readonly resort: () => Resort;
  readonly clock: { readonly speed: SimSpeed; setSpeed(speed: SimSpeed): void };
  // Under a bench nothing is capped, the controls stay off, and `follow` is followed from the
  // first frame, stepped by the bench's fixed step.
  readonly bench: BenchConfig | null;
  readonly fixedStep: number | null;
  readonly drifting: () => boolean;
  readonly onChange: (view: FollowView | null) => void;
  readonly onSpeedChange: (speed: SimSpeed) => void;
}

export interface GuestView {
  readonly active: boolean;
  // The guest followed, also during a ride along; null for a ride from the palette.
  readonly person: number | null;
  follow(target: FollowTarget): void;
  followGuest(person: number): void;
  stop(): void;
  // A click on the plot while following: another guest is hopped to, anything else stops it.
  pick(picked: InspectTarget, select: (target: InspectTarget) => void): void;
  // Arming a tool ends a follow; putting one down does not.
  toolPicked(tool: object | null): void;
  toggleView(): void;
  rideAlong(): void;
  // Moves the camera if it is the rig's; false leaves it to the controls.
  steer(elapsed: number): boolean;
  // The plot's placements changed, so what stands in the camera's way did too.
  relayout(): void;
  offers(): readonly RideCommand[];
  // The camera the player had before following; a save keeps it rather than a guest's eye.
  heldCamera(): CameraSnapshot | null;
  // Every speed but paused is Slow while following; the one picked comes back after.
  setSpeed(speed: SimSpeed): void;
  // Hands the camera back without ending the follow, for a photo taken from where it is.
  suspend(): void;
  resume(): void;
  dispose(): void;
}

interface Ride {
  readonly craft: number;
  // The sea the craft is on: an edit that puts new fleets out replaces it, which ends the ride.
  readonly sea: SeaField;
}

interface Following {
  guest: { readonly person: number; readonly party: number } | null;
  ride: Ride | null;
  view: ViewMode;
  readonly held: CameraSnapshot;
  remembered: SimSpeed | null;
  leftFor: number | null;
  firstPerson: boolean;
  rideOffered: boolean;
  doorway: Doorway;
  // The hut whose visit was already shown out on a craft, so the next boat is not ridden too.
  rodeFrom: string | null;
}

const craftLabel = (ride: Ride): string =>
  SEA_MODELS[ride.sea.flotilla.variant[ride.craft]!]!.label;

function sourcesOf(resort: Resort): GuestSources {
  const { crowd } = resort.crowd;
  return {
    crowd,
    drawn: resort.cast,
    guests: resort.guests,
    resting: (person) => restingOn(crowd, person),
  };
}

function viewOf(state: Following): FollowView {
  return {
    guest: state.guest?.person ?? null,
    riding: state.ride && craftLabel(state.ride),
    view: state.view,
    firstPerson: state.firstPerson,
    rideOffered: state.rideOffered,
    left: state.leftFor !== null,
  };
}

const GONE: Sighting = { kind: 'gone' };

const rideSighting = (ride: Ride, sea: SeaField): Sighting =>
  ride.sea === sea ? craftSighting(sea.flotilla, ride.craft, BUOY_INDEX) : GONE;

// On a craft the camera is at the bow, and the guest who hired it stays at the hut.
const eyesOf = (state: Following): number | null =>
  state.ride ? null : (state.guest?.person ?? null);

const HIDDEN: Glimpse = { inside: true, eye: null, clear: false };

const eyeOf = ({ at, framing }: TargetPose): Vec3 => ({ x: at.x, y: at.y + framing.eye, z: at.z });

const target = (state: Following, aimed: FollowTarget, sea: SeaField): void => {
  state.leftFor = null;
  state.doorway = OUT_OF_SIGHT;
  state.rodeFrom = null;
  if (aimed.kind === 'guest') {
    state.guest = { person: aimed.person, party: aimed.party };
    state.ride = null;
    return;
  }
  state.guest = null;
  state.ride = { craft: aimed.craft, sea };
};

// The venue a guest is inside, not queuing for; null for none.
function visiting(resort: Resort, person: number): string | null {
  const visit = resort.router.visitOf(person);
  return visit && !visit.waiting ? visit.venue.key : null;
}

function hutCraft(resort: Resort, hut: string | null): number | null {
  if (hut === null) return null;
  return hutRide(resort.sea.flotilla, fleetHutKeys(resort.rentals, hireOf), hut, BUOY_INDEX);
}

export function createGuestView(parts: GuestViewParts): GuestView {
  const { handle, clock, bench } = parts;
  const current = parts.resort;
  const camera = createFollowCamera({
    canvas: parts.canvas,
    camera: () => handle.camera,
    controls: handle.controls,
  });
  let following: Following | null = null;
  let suspended = false;
  let benchPending = bench?.follow !== undefined;
  let skyline: Skyline | null = null;
  let told: FollowView | null = null;

  const skylineNow = (): Skyline => {
    if (skyline) return skyline;
    const { plot, plan } = current();
    const standing = [...plot.placements, ...plot.props];
    skyline = skylineOf(standing, solidTopsById, plan.tilesX, plan.tilesZ);
    return skyline;
  };

  const groundAt = (tileX: number, tileZ: number): number =>
    levelHeight(current().terrain.levelOf(tileX, tileZ));

  const reachOf: ReachOf = (look, free) => clearShare(skylineNow(), groundAt, look, free);

  const tell = (): void => {
    const view = following && viewOf(following);
    if (sameFollowView(view, told)) return;
    told = view;
    parts.onChange(view);
  };

  const setSpeed = (speed: SimSpeed | null): void => {
    if (speed === null || speed === clock.speed) return;
    clock.setSpeed(speed);
    parts.onSpeedChange(speed);
  };

  const cap = (): SimSpeed | null => {
    if (bench) return null;
    const capped = cappedSpeed(clock.speed);
    setSpeed(capped.speed);
    return capped.remembered;
  };

  const begin = (): Following => {
    const held = cameraOf(handle);
    handle.setCameraMode('perspective');
    camera.begin();
    suspended = false;
    return {
      guest: null,
      ride: null,
      view: bench?.follow ?? 'third',
      held,
      remembered: cap(),
      leftFor: null,
      firstPerson: true,
      rideOffered: false,
      doorway: OUT_OF_SIGHT,
      rodeFrom: null,
    };
  };

  const follow = (aimed: FollowTarget): void => {
    if (parts.drifting()) return;
    following ??= begin();
    target(following, aimed, current().sea);
    tell();
  };

  const followGuest = (person: number): void =>
    follow({ kind: 'guest', person, party: current().guests.party[person]! });

  const stop = (): void => {
    if (!following) return;
    const ended = following;
    following = null;
    const ground = camera.end();
    current().crowd.hide(null);
    restoreCamera(handle, ground ? shiftedCamera(ended.held, ground) : ended.held);
    handle.controls.enabled = !bench;
    setSpeed(speedAfterFollowing(ended.remembered, clock.speed));
    tell();
  };

  // A ride ends when its craft ties up, and the camera goes back to the guest who hired it.
  const rideNow = (state: Following): Sighting | null => {
    if (!state.ride) return null;
    const ridden = rideSighting(state.ride, current().sea);
    if (ridden.kind !== 'gone' || !state.guest) return ridden;
    state.ride = null;
    return null;
  };

  const guestNow = (state: Following): Sighting =>
    state.guest ? guestSighting(sourcesOf(current()), state.guest) : GONE;

  // Held a moment on where they were, so the card can say who left; a ride from the palette ends
  // at once.
  const holdLeft = (state: Following, dt: number): void => {
    state.leftFor = (state.leftFor ?? 0) + dt;
    current().crowd.hide(null);
    if (state.leftFor >= LEFT_HOLD_SECONDS || !state.guest) stop();
  };

  const followBench = (): void => {
    benchPending = false;
    const person = benchGuest(sourcesOf(current()));
    if (person === null) console.warn('Bench follow: nobody is walking, so the run is unfollowed');
    else followGuest(person);
  };

  const seenFromCamera = (eye: Vec3): boolean => {
    const from = camera.position();
    return from === null || reachOf(eye, from) >= SEEN_SHARE;
  };

  // In first person the eyes are the camera, so coming out of a door is coming into view.
  const glimpseOf = (sighting: Sighting, view: ViewMode): Glimpse => {
    if (sighting.kind !== 'seen') return HIDDEN;
    const eye = eyeOf(sighting.pose);
    const clear = view === 'first' || seenFromCamera(eye);
    return { inside: roofOver(skylineNow(), eye), eye, clear };
  };

  // A craft is never indoors; a guest going in or coming out keeps the camera at the door.
  const held = (state: Following, sighting: Sighting, view: ViewMode, dt: number): boolean => {
    if (state.ride) return false;
    const glimpse = glimpseOf(sighting, view);
    state.doorway = nextDoorway(state.doorway, glimpse, dt);
    return holds(state.doorway) && camera.hold(heldLook(state.doorway, glimpse), dt);
  };

  const watch = (
    state: Following,
    sighting: Sighting & { kind: 'seen' | 'hidden' },
    dt: number,
  ) => {
    const look = lookOf(sighting, state.view, eyesOf(state));
    state.firstPerson = look.firstPerson;
    state.rideOffered = rideable(state) !== null;
    rideOut(state);
    const stands = held(state, sighting, look.view, dt);
    current().crowd.hide(stands ? null : look.hidden);
    if (!stands) camera.advance(sighting.pose, look.view, dt, look.occluded ? reachOf : null);
  };

  const rideable = (state: Following): number | null => {
    if (state.ride || !state.guest) return null;
    return hutCraft(current(), visiting(current(), state.guest.person));
  };

  // The sim keeps a hirer in the hut, so a guest inside one with a craft out is shown out on it,
  // once a visit; the card's Ride along takes the next one.
  const rideOut = (state: Following): void => {
    const hut = state.guest && visiting(current(), state.guest.person);
    if (hut === state.rodeFrom) return;
    state.rodeFrom = null;
    const craft = rideable(state);
    if (craft === null) return;
    state.ride = { craft, sea: current().sea };
    state.rodeFrom = hut;
    state.doorway = OUT_OF_SIGHT;
  };

  const look = (state: Following, dt: number): void => {
    const sighting = rideNow(state) ?? guestNow(state);
    if (sighting.kind === 'gone') holdLeft(state, Math.max(dt, 0));
    else watch(state, sighting, dt);
    tell();
  };

  const steering = (): boolean => benchPending || (following !== null && !suspended);

  const advance = (dt: number): void => {
    if (benchPending) followBench();
    const state = suspended ? null : following;
    if (state) look(state, dt);
  };

  return {
    get active() {
      return following !== null;
    },
    get person() {
      return following?.guest?.person ?? null;
    },
    follow,
    followGuest,
    stop,
    pick(picked, select) {
      const move = followMove(following !== null, picked);
      if (move.stop) stop();
      if (move.select) select(picked);
      if (move.hop !== null) followGuest(move.hop);
    },
    toolPicked(tool) {
      if (tool !== null) stop();
    },
    toggleView() {
      if (!following) return;
      following.view = following.view === 'third' ? 'first' : 'third';
      camera.viewChanged(following.view);
      tell();
    },
    rideAlong() {
      const craft = following && rideable(following);
      if (!following || craft === null) return;
      following.ride = { craft, sea: current().sea };
      following.doorway = OUT_OF_SIGHT;
      tell();
    },
    steer(elapsed) {
      if (!steering()) return false;
      advance(parts.fixedStep ?? elapsed);
      return true;
    },
    relayout() {
      skyline = null;
    },
    offers() {
      return rideOffers(current().sea.flotilla, BUOY_INDEX).map((offer) => ({
        craft: offer.craft,
        label: rideLabel(SEA_MODELS[offer.variant]!.label, offer.only),
      }));
    },
    heldCamera: () => following?.held ?? null,
    setSpeed(speed) {
      if (!following) return clock.setSpeed(speed);
      const picked = pickedWhileFollowing(following.remembered, speed);
      following.remembered = picked.remembered;
      clock.setSpeed(picked.speed);
      // Told back, so the speed buttons show Slow rather than the one pressed.
      if (picked.speed !== speed) parts.onSpeedChange(picked.speed);
    },
    suspend() {
      if (!following || suspended) return;
      suspended = true;
      camera.suspend();
      handle.controls.enabled = !bench;
      current().crowd.hide(null);
    },
    resume() {
      if (!following || !suspended) return;
      suspended = false;
      camera.resume();
    },
    dispose() {
      camera.end();
      following = null;
    },
  };
}
