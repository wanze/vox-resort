import { useCallback, useRef, useState, type RefObject } from 'react';
import { track } from '../features/analytics/adapters/tracker';
import type { Showcase } from './showcase';
import { usePostcardLink } from './useSharing';
import { CAMERA_FOV_DEGREES } from '../features/layout/domain/worldBounds';
import type { PhotoSpot } from '../features/sim/domain/dayReport';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { BuildTool } from '../features/build/domain/buildTool';
import type { FollowView } from '../features/guest-view/domain/followRules';
import {
  PHOTO_FILTERS,
  type ColorMatrix,
  type PhotoFilterId,
} from '../features/photo/domain/photoFilters';
import { photoFileName } from '../features/photo/domain/photoName';
import type { PhotoPixels, PhotoSize } from '../features/photo/domain/photoPixels';
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
import { cardSize } from '../features/hud/domain/photoWall';

// Asked for by the newspaper: the shot used goes to the front page, and leaving without one says so.
export interface FrontPageSession {
  // The day the shot was taken on, and its hour as a share of the day.
  keep(pixels: PhotoPixels, matrix: ColorMatrix, day: number, time: number): void;
  left(): void;
}

export interface PhotoMode extends PhotoControls {
  startFrontPage(session: FrontPageSession): void;
}

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

interface Developed {
  readonly pixels: PhotoPixels;
  readonly day: number;
  readonly time: number;
}

function useShot(showcase: RefObject<Showcase | null>, parts: PhotoParts) {
  const [shot, setShot] = useState<PhotoShot | null>(null);
  // Uncaptioned, for the front page; dropped with the shot.
  const kept = useRef<Developed | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<PhotoFilterId>('none');
  const [scale, setScale] = useState<PhotoScale>(1);

  const develop = async (mounted: Showcase, time: number): Promise<PhotoShot> => {
    const pixels = await mounted.capturePhoto(scale);
    kept.current = { pixels, day: dayOf(parts), time };
    // Always the resort's name for now; whether to write one, and what, may become a choice.
    const look = { matrix: PHOTO_FILTERS[filter].matrix, caption: nameOf(parts) };
    return { blob: await encodePhoto(pixels, look), name: fileNameOf(parts, time) };
  };

  const take = (time: number): void => {
    const mounted = showcase.current;
    if (!mounted || busy) return;
    setBusy(true);
    develop(mounted, time)
      .then((developed) => {
        setShot(developed);
        track({ name: 'photo_taken' });
      }, console.error)
      .finally(() => setBusy(false));
  };

  return {
    shot,
    kept,
    // A new session starts with nothing taken: last time's photo was saved or let go.
    forget: useCallback(() => {
      kept.current = null;
      setShot(null);
    }, []),
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
    const pixels = await mounted.pictureOf(spot, cardSize(window.devicePixelRatio));
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

const MINUTES_PER_DAY = 1440;

async function enlargedFrom(
  showcase: RefObject<Showcase | null>,
  parts: PhotoParts,
  spot: PhotoSpot,
  size: PhotoSize,
  daysAgo: number,
): Promise<PhotoShot | null> {
  const mounted = showcase.current;
  if (!mounted) return null;
  try {
    const pixels = await mounted.pictureOf(spot, size);
    const look = { matrix: PHOTO_FILTERS.none.matrix, caption: nameOf(parts) };
    const day = Math.max(0, dayOf(parts) - daysAgo);
    const name = photoFileName(nameOf(parts), day, spot.minute / MINUTES_PER_DAY);
    return { blob: await encodePhoto(pixels, look), name };
  } catch (cause: unknown) {
    console.error(cause);
    return null;
  }
}

// Begun once photo mode is open; whichever way photo mode is left ends it and hands it back.
function useFrontPage() {
  const session = useRef<FrontPageSession | null>(null);
  const [on, setOn] = useState(false);
  const begin = useCallback((asked: FrontPageSession) => {
    session.current = asked;
    setOn(true);
  }, []);
  const end = useCallback((): FrontPageSession | null => {
    const ended = session.current;
    session.current = null;
    setOn(false);
    return ended;
  }, []);
  return { on, begin, end };
}

// Read before closing, which forgets the shot.
function keepShot(
  kept: RefObject<Developed | null>,
  filter: PhotoFilterId,
  close: () => FrontPageSession | null,
): void {
  const shot = kept.current;
  if (shot) close()?.keep(shot.pixels, PHOTO_FILTERS[filter].matrix, shot.day, shot.time);
}

const leaveSession = (ended: FrontPageSession | null): void => ended?.left();

// The lens and the hour, both put back when photo mode is left.
function useLens(showcase: RefObject<Showcase | null>) {
  const [fov, setFovState] = useState(CAMERA_FOV_DEGREES);
  const [lookTime, setLookTimeState] = useState<number | null>(null);
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
  const reset = useCallback(() => {
    setFovState(CAMERA_FOV_DEGREES);
    setLookTimeState(null);
  }, []);
  return { fov, setFov, lookTime, setLookTime, reset };
}

export function usePhotoMode(showcase: RefObject<Showcase | null>, parts: PhotoParts): PhotoMode {
  const [on, setOn] = useState(false);
  const [clockTime, setClockTime] = useState(0);
  const lens = useLens(showcase);
  const { reset: resetLens } = lens;
  // The speed to go back to: entering pauses the clock so the scene holds still for the picture.
  const speedBefore = useRef<SimSpeed | null>(null);
  const selfie = useSelfie(showcase, parts.following);
  const shots = useShot(showcase, parts);
  const { clock, selectTool } = parts;
  const { reset: resetSelfie } = selfie;
  const { forget: forgetShot } = shots;
  const postcard = usePostcardLink(showcase);
  const picture = usePicture(showcase);
  const frontPage = useFrontPage();
  const { end: endFrontPage } = frontPage;

  const open = useCallback((): boolean => {
    const mounted = showcase.current;
    if (on || !mounted) return false;
    selectTool(null);
    if (!mounted.setPhotoMode(true)) return false;
    speedBefore.current = clock.speed;
    clock.setSpeed('paused');
    setClockTime(mounted.clockTime);
    setOn(true);
    return true;
  }, [showcase, on, clock, selectTool]);

  const close = useCallback((): FrontPageSession | null => {
    const mounted = showcase.current;
    if (!on || !mounted) return null;
    mounted.setPhotoMode(false);
    if (speedBefore.current) clock.setSpeed(speedBefore.current);
    speedBefore.current = null;
    resetSelfie();
    forgetShot();
    setOn(false);
    resetLens();
    return endFrontPage();
  }, [showcase, on, clock, resetSelfie, forgetShot, resetLens, endFrontPage]);

  const enter = useCallback(() => void open(), [open]);

  const exit = useCallback(() => leaveSession(close()), [close]);

  const { begin: beginFrontPage } = frontPage;
  const startFrontPage = useCallback(
    (asked: FrontPageSession) => (open() ? beginFrontPage(asked) : asked.left()),
    [open, beginFrontPage],
  );

  return {
    on,
    enter,
    exit,
    fov: lens.fov,
    setFov: lens.setFov,
    lookTime: lens.lookTime,
    clockTime,
    setLookTime: lens.setLookTime,
    filter: shots.filter,
    setFilter: shots.setFilter,
    scale: shots.scale,
    setScale: shots.setScale,
    take: () => shots.take(lens.lookTime ?? clockTime),
    shot: shots.shot,
    save: shots.save,
    share: shots.share,
    canShare: CAN_SHARE,
    busy: shots.busy,
    selfie: selfie.controls,
    postcard,
    picture,
    enlarge: (spot, size, daysAgo) => enlargedFrom(showcase, parts, spot, size, daysAgo),
    saveShot: (shot) => savePhoto(shot.blob, shot.name),
    shareShot: (shot) => {
      void sharePhoto(shot.blob, shot.name, nameOf(parts)).catch(console.error);
    },
    frontPage: {
      session: frontPage.on,
      use: () => keepShot(shots.kept, shots.filter, close),
    },
    startFrontPage,
  };
}
