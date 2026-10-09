import { PerspectiveCamera, type Object3D } from 'three/webgpu';
import { CHILD_FRAMING, GUEST_FRAMING } from '../features/guest-view/domain/followRig';
import { CAMERA_FOV_DEGREES, type CameraMode } from '../features/layout/domain/worldBounds';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { perspectiveLens } from '../features/rendering/domain/levelOfDetail';
import { DRAWN_POSE } from '../features/rendering/domain/poses';
import { createPhotoCapture } from '../features/photo/adapters/photoCapture';
import { flashed, flashFor } from '../features/photo/domain/flash';
import {
  MAX_PHOTO_SIDE,
  photoSize,
  type PhotoPixels,
  type PhotoSize,
} from '../features/photo/domain/photoPixels';
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
  // From where a guest stood, at the photo's hour, with a flash after dark. The weather, the
  // parasols and which rooms are lit are as they are now.
  pictureOf(spot: Viewpoint, size: PhotoSize): Promise<PhotoPixels>;
  // Always with the sun behind the guest while it is up: the selfie is for the sunset.
  setSelfie(on: boolean): boolean;
  // Each frame after the choreography and before the crowd writes its instances.
  hold(): void;
  // The resort and its cast were replaced: there is nobody left to put back.
  forget(): void;
  postcardView(): PostcardView;
}

export interface Viewpoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly minute: number;
  // Absent on photos from before each had its own framing.
  readonly fov?: number;
  readonly tilt?: number;
}

const PICTURE_FOV = 60;

// A little up from level, as a phone is held: the horizon sits below the middle of the frame.
const PICTURE_TILT = 0.12;

const MINUTES_PER_DAY = 1440;

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
  const pictureCamera = new PerspectiveCamera(PICTURE_FOV, 3 / 2, 0.5, handle.camera.far);
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

  // The lens is the photo's own, so the detail around a far spot is drawn as near as it is.
  const detailFor = (view: { x: number; y: number; z: number }, height: number, fov: number) => {
    if (!parts.detail()) return;
    const detail = { x: view.x, y: view.y, z: view.z, lens: perspectiveLens(height, fov) };
    current().world.updateDetail(detail);
    current().crowd.setView(detail);
    current().crowd.advance(0, 0);
  };

  // At once, not by the next frame: the crowd writes its instances before that frame chooses its
  // detail, so it would be drawn once as the photo saw it and everyone out of its reach blinks.
  const restoreDetail = (): void => {
    if (!parts.detail()) return;
    const view = handle.detailView();
    current().world.updateDetail(view);
    current().crowd.setView(view);
    current().crowd.advance(0, 0);
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
    // Detail is chosen for the photo's own size, and the screen's is put back once it is drawn.
    capture(scale) {
      const size = photoSize(handle.drawingBufferSize(), scale, MAX_PHOTO_SIDE);
      detailFor(handle.detailView(), size.height, handle.fov);
      try {
        return capturer.capture(handle.scene, handle.camera, size);
      } finally {
        restoreDetail();
      }
    },
    // The HUD's groups, the hour, the flash and the detail are put back as they were before the read-back is
    // awaited: the capture draws before its first await. Photo mode's own hour is what goes back.
    pictureOf(spot, size) {
      const fov = spot.fov ?? PICTURE_FOV;
      const tilt = spot.tilt ?? PICTURE_TILT;
      const eye = { x: spot.x, y: spot.y + GUEST_FRAMING.eye, z: spot.z };
      pictureCamera.fov = fov;
      pictureCamera.aspect = size.width / size.height;
      pictureCamera.updateProjectionMatrix();
      pictureCamera.position.set(eye.x, eye.y, eye.z);
      const ahead = Math.cos(tilt);
      pictureCamera.lookAt(
        eye.x + Math.sin(spot.heading) * ahead,
        eye.y + Math.sin(tilt),
        eye.z + Math.cos(spot.heading) * ahead,
      );
      pictureCamera.updateMatrixWorld();
      detailFor(eye, size.height, fov);
      const flash = flashFor(spot.minute);
      clock.setLookTime(spot.minute / MINUTES_PER_DAY);
      handle.setFlash(flash);
      const groups = parts.hudGroups();
      const shown = groups.map((group) => group.visible);
      showHud(false);
      try {
        const taken = capturer.capture(handle.scene, pictureCamera, size);
        return taken.then((pixels) => flashed(pixels, flash));
      } finally {
        groups.forEach((group, at) => (group.visible = shown[at]!));
        handle.setFlash(0);
        clock.setLookTime(lookTime);
        restoreDetail();
      }
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
