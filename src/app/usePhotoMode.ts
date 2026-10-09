import { useCallback, useRef, useState, type RefObject } from 'react';
import type { Showcase } from './showcase';
import { usePostcardLink } from './useSharing';
import { CAMERA_FOV_DEGREES } from '../features/layout/domain/worldBounds';
import type { PhotoSpot } from '../features/sim/domain/dayReport';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { BuildTool } from '../features/build/domain/buildTool';
import type { FollowView } from '../features/guest-view/domain/followRules';
import { PHOTO_FILTERS, type PhotoFilterId } from '../features/photo/domain/photoFilters';
import { photoFileName } from '../features/photo/domain/photoName';
import { clampFov } from '../features/photo/domain/photoView';
import {
  canSharePhotos,
  encodePhoto,
  savePhoto,
  sharePhoto,
} from '../features/photo/adapters/photoFile';
import type {
  PhotoControls,
  PhotoScale,
  PhotoShot,
  SelfieControls,
} from '../features/photo/components/photoControls';
import type { ClockControls } from '../features/hud/components/hudControls';
import type { HudStore } from '../features/hud/domain/hudStore';

export interface PhotoParts {
  readonly clock: ClockControls;
  readonly selectTool: (tool: BuildTool | null) => void;
  readonly following: FollowView | null;
  // Read when a photo is taken, so the app does not re-render every simulated hour.
  readonly hud: HudStore;
}

const CAN_SHARE = canSharePhotos();

const dayOf = (parts: PhotoParts): number => parts.hud.getSnapshot().status?.day ?? 0;

const nameOf = (parts: PhotoParts): string => parts.hud.getSnapshot().name ?? 'Vox Resort';

const fileNameOf = (parts: PhotoParts, time: number): string =>
  photoFileName(nameOf(parts), dayOf(parts), time);

// The guest followed on foot; on a craft the camera is at the bow and the guest is in the hut.
const followedOnFoot = (following: FollowView | null): boolean =>
  following !== null && following.guest !== null && following.riding === null;

function useSelfie(showcase: RefObject<Showcase | null>, following: FollowView | null) {
  const [on, setOnState] = useState(false);
  const setOn = useCallback(
    (next: boolean) => {
      const taken = showcase.current?.setSelfie(next) ?? false;
      setOnState(next && taken);
    },
    [showcase],
  );
  const reset = useCallback(() => setOnState(false), []);
  const controls: SelfieControls = { offered: followedOnFoot(following), on, setOn };
  return { controls, reset };
}

function useShot(showcase: RefObject<Showcase | null>, parts: PhotoParts) {
  const [shot, setShot] = useState<PhotoShot | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<PhotoFilterId>('none');
  const [scale, setScale] = useState<PhotoScale>(1);

  const develop = async (mounted: Showcase, time: number): Promise<PhotoShot> => {
    const pixels = await mounted.capturePhoto(scale);
    // Always the resort's name for now; whether to write one, and what, may become a choice.
    const look = { matrix: PHOTO_FILTERS[filter].matrix, caption: nameOf(parts) };
    return { blob: await encodePhoto(pixels, look), name: fileNameOf(parts, time) };
  };

  const take = (time: number): void => {
    const mounted = showcase.current;
    if (!mounted || busy) return;
    setBusy(true);
    develop(mounted, time)
      .then(setShot, console.error)
      .finally(() => setBusy(false));
  };

  return {
    shot,
    // A new session starts with nothing taken: last time's photo was saved or let go.
    forget: useCallback(() => setShot(null), []),
    busy,
    filter,
    setFilter,
    scale,
    setScale,
    take,
    save: () => {
      if (shot) savePhoto(shot.blob, shot.name);
    },
    share: () => {
      if (shot) void sharePhoto(shot.blob, shot.name, nameOf(parts)).catch(console.error);
    },
  };
}

// Never saved: the URL is the wall's to revoke, and a failed render leaves the card without one.
async function pictureFrom(
  showcase: RefObject<Showcase | null>,
  spot: PhotoSpot,
): Promise<string | null> {
  const mounted = showcase.current;
  if (!mounted) return null;
  try {
    const pixels = await mounted.pictureOf(spot);
    const blob = await encodePhoto(pixels, { matrix: PHOTO_FILTERS.none.matrix, caption: null });
    return URL.createObjectURL(blob);
  } catch (cause: unknown) {
    console.error(cause);
    return null;
  }
}

function usePicture(showcase: RefObject<Showcase | null>) {
  return useCallback((spot: PhotoSpot) => pictureFrom(showcase, spot), [showcase]);
}

export function usePhotoMode(
  showcase: RefObject<Showcase | null>,
  parts: PhotoParts,
): PhotoControls {
  const [on, setOn] = useState(false);
  const [fov, setFovState] = useState(CAMERA_FOV_DEGREES);
  const [lookTime, setLookTimeState] = useState<number | null>(null);
  const [clockTime, setClockTime] = useState(0);
  // The speed to go back to: entering pauses the clock so the scene holds still for the picture.
  const speedBefore = useRef<SimSpeed | null>(null);
  const selfie = useSelfie(showcase, parts.following);
  const shots = useShot(showcase, parts);
  const { clock, selectTool } = parts;
  const { reset: resetSelfie } = selfie;
  const { forget: forgetShot } = shots;
  const postcard = usePostcardLink(showcase);
  const picture = usePicture(showcase);

  const enter = useCallback(() => {
    const mounted = showcase.current;
    if (on || !mounted) return;
    selectTool(null);
    if (!mounted.setPhotoMode(true)) return;
    speedBefore.current = clock.speed;
    clock.setSpeed('paused');
    setClockTime(mounted.clockTime);
    setOn(true);
  }, [showcase, on, clock, selectTool]);

  const exit = useCallback(() => {
    const mounted = showcase.current;
    if (!on || !mounted) return;
    mounted.setPhotoMode(false);
    if (speedBefore.current) clock.setSpeed(speedBefore.current);
    speedBefore.current = null;
    resetSelfie();
    forgetShot();
    setOn(false);
    setFovState(CAMERA_FOV_DEGREES);
    setLookTimeState(null);
  }, [showcase, on, clock, resetSelfie, forgetShot]);

  const setFov = useCallback(
    (degrees: number) => {
      showcase.current?.setFov(degrees);
      setFovState(clampFov(degrees));
    },
    [showcase],
  );

  const setLookTime = useCallback(
    (time: number | null) => {
      const mounted = showcase.current;
      if (!mounted) return;
      mounted.setLookTime(time);
      setLookTimeState(time);
    },
    [showcase],
  );

  return {
    on,
    enter,
    exit,
    fov,
    setFov,
    lookTime,
    clockTime,
    setLookTime,
    filter: shots.filter,
    setFilter: shots.setFilter,
    scale: shots.scale,
    setScale: shots.setScale,
    take: () => shots.take(lookTime ?? clockTime),
    shot: shots.shot,
    save: shots.save,
    share: shots.share,
    canShare: CAN_SHARE,
    busy: shots.busy,
    selfie: selfie.controls,
    postcard,
    picture,
  };
}
