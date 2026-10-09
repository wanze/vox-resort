import type { Object3D } from 'three/webgpu';
import { CHILD_FRAMING, GUEST_FRAMING } from '../features/guest-view/domain/followRig';
import { CAMERA_FOV_DEGREES, type CameraMode } from '../features/layout/domain/worldBounds';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { perspectiveLens } from '../features/rendering/domain/levelOfDetail';
import { DRAWN_POSE } from '../features/rendering/domain/poses';
import { createPhotoCapture } from '../features/photo/adapters/photoCapture';
import { MAX_PHOTO_SIDE, photoSize, type PhotoPixels } from '../features/photo/domain/photoPixels';
import { clampFov } from '../features/photo/domain/photoView';
import {
  canSelfie,
  drawnStanding,
  holdSelfie,
  releaseSelfie,
  selfiePose,
  type HeldSelfie,
  type Standing,
} from '../features/photo/domain/selfie';
import type { PostcardView } from '../features/sharing/domain/sharedResort';
import type { GuestView } from './guestView';
import type { Clock, Resort } from './showcase';

interface PhotoParts {
  readonly handle: SceneHandle;
  readonly clock: Pick<Clock, 'time' | 'sky' | 'setLookTime'>;
  readonly resort: () => Resort;
  readonly guestView: Pick<GuestView, 'person' | 'suspend' | 'resume'>;
  // What the HUD draws into the scene, which would otherwise be in the picture.
  readonly hudGroups: () => readonly Object3D[];
  readonly detail: () => boolean;
}

export interface PhotoMode {
  readonly active: boolean;
  setOn(on: boolean): void;
  setLookTime(time: number | null): void;
  setFov(degrees: number): void;
  capture(scale: number): Promise<PhotoPixels>;
  // Always with the sun behind the guest while it is up: the selfie is for the sunset.
  setSelfie(on: boolean): boolean;
  // Each frame after the choreography and before the crowd writes its instances.
  hold(): void;
  // The resort and its cast were replaced: there is nobody left to put back.
  forget(): void;
  postcardView(): PostcardView;
}

interface Selfie {
  readonly person: number;
  readonly standing: Standing;
  readonly eye: number;
  at: Standing;
  held: HeldSelfie | null;
}

const tuple = (point: { x: number; y: number; z: number }): [number, number, number] => [
  point.x,
  point.y,
  point.z,
];

const eyeOf = (guests: Resort['guests'], person: number): number =>
  (guests.child[person] === 1 ? CHILD_FRAMING : GUEST_FRAMING).eye;

export function createPhotoMode(parts: PhotoParts): PhotoMode {
  const { handle, clock, guestView } = parts;
  const current = parts.resort;
  const capturer = createPhotoCapture(handle.renderer);
  let before: { readonly mode: CameraMode } | null = null;
  let lookTime: number | null = null;
  let selfie: Selfie | null = null;

  const release = (): void => {
    if (selfie?.held) releaseSelfie(current().cast, selfie.held);
    selfie = null;
  };

  // From where they stood when the selfie began, so turning the sun round never walks them.
  const pose = (shot: Selfie): void => {
    const { sky } = clock;
    const sun = sky.sunGlow > 0 ? sky.sunDirection : null;
    const taken = selfiePose(shot.standing, shot.eye, sun, handle.fov);
    shot.at = { ...shot.standing, heading: taken.heading };
    handle.setPose(taken.pose);
  };

  const setLookTime = (time: number | null): void => {
    lookTime = time;
    clock.setLookTime(time);
    if (selfie) pose(selfie);
  };

  const showHud = (shown: boolean): void => {
    for (const group of parts.hudGroups()) group.visible = shown;
  };

  const startSelfie = (): boolean => {
    const person = guestView.person;
    if (before === null || person === null) return false;
    const { cast, crowd, guests } = current();
    if (!canSelfie(cast, crowd.crowd.offPlot[person] === 1, person)) return false;
    const standing = drawnStanding(cast, crowd.crowd, person);
    selfie = { person, standing, eye: eyeOf(guests, person), at: standing, held: null };
    pose(selfie);
    return true;
  };

  return {
    get active() {
      return before !== null;
    },
    setOn(on) {
      const was = before;
      if (on === (was !== null)) return;
      if (was === null) {
        before = { mode: handle.cameraMode };
        guestView.suspend();
        handle.setCameraMode('perspective');
        showHud(false);
        return;
      }
      release();
      showHud(true);
      setLookTime(null);
      handle.setFov(CAMERA_FOV_DEGREES);
      handle.setCameraMode(was.mode);
      before = null;
      guestView.resume();
    },
    setLookTime,
    setFov(degrees) {
      handle.setFov(clampFov(degrees));
    },
    // Detail is chosen for the photo's own size; the next frame's choice puts it back.
    capture(scale) {
      const size = photoSize(handle.drawingBufferSize(), scale, MAX_PHOTO_SIDE);
      if (parts.detail()) {
        const view = { ...handle.detailView(), lens: perspectiveLens(size.height, handle.fov) };
        current().world.updateDetail(view);
        current().crowd.setView(view);
        current().crowd.advance(0, 0);
      }
      return capturer.capture(handle.scene, handle.camera, size);
    },
    setSelfie(on) {
      release();
      return !on || startSelfie();
    },
    hold() {
      if (!selfie) return;
      const held = holdSelfie(current().cast, selfie.person, selfie.at, DRAWN_POSE.selfie);
      selfie.held ??= held;
    },
    forget() {
      selfie = null;
    },
    postcardView() {
      const { camera, controls } = handle;
      return {
        position: tuple(camera.position),
        target: tuple(controls.target),
        fov: clampFov(handle.fov),
        time: lookTime ?? clock.time,
      };
    },
  };
}
