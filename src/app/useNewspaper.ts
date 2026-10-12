import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { FrontCapture, Showcase } from './showcase';
import type { FrontPageSession } from './usePhotoMode';
import { frontPhotoBlob, newsprintUrl } from '../features/newspaper/adapters/paperPhoto';
import {
  keepPending,
  listEditions,
  printEdition,
  readEdition,
  readPending,
  type PendingPhoto,
} from '../features/newspaper/adapters/paperStore';
import { editionNow, type Edition, type EditionPhoto } from '../features/newspaper/domain/edition';
import type {
  OpenPaper,
  PaperControls,
  PhotoCallControls,
} from '../features/newspaper/components/paperControls';
import { PHOTO_FILTERS } from '../features/photo/domain/photoFilters';
import type { ClockControls } from '../features/hud/components/hudControls';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type { SimSpeed } from '../features/sim/domain/simClock';

const MINUTES_PER_DAY = 1440;

const NO_FILTER = PHOTO_FILTERS.none.matrix;

const NONE: readonly Edition[] = [];

interface Call {
  readonly season: number;
  readonly speed: SimSpeed;
}

export interface Newspaper {
  readonly call: PhotoCallControls;
  readonly paper: PaperControls;
  // Stable, for the showcase's options, which are handed over once.
  readonly onPhotoCall: (season: number, speed: SimSpeed) => void;
  readonly onSeasonEnded: (fallback: Promise<FrontCapture> | null) => void;
}

// The archive failing costs nothing but the archive: the photo is then held here till printed.
function usePending(showcase: RefObject<Showcase | null>, hud: HudStore) {
  const held = useRef<PendingPhoto | null>(null);
  const keep = useCallback(
    async (season: number, photo: Promise<Blob>, origin: EditionPhoto): Promise<void> => {
      const gameId = hud.getSnapshot().gameId;
      if (gameId === null) return;
      const pending = { gameId, season, photo: await photo, origin };
      held.current = pending;
      showcase.current?.setPhotoCallAnswered(season);
      await keepPending(pending).catch(console.error);
    },
    [showcase, hud],
  );
  const pendingFor = useCallback(async (gameId: string, season: number) => {
    const stored = await readPending(gameId).catch(() => null);
    const found = [stored, held.current].find(
      (each) => each?.gameId === gameId && each.season === season,
    );
    return found ?? null;
  }, []);
  const printed = useCallback(() => {
    held.current = null;
  }, []);
  return { keep, pendingFor, printed };
}

interface Listed {
  readonly gameId: string;
  readonly editions: readonly Edition[];
}

function useArchive(showcase: RefObject<Showcase | null>, gameId: string | null) {
  const [listed, setListed] = useState<Listed | null>(null);
  const refresh = useCallback(
    (id: string): Promise<void> =>
      listEditions(id)
        .catch(() => NONE)
        .then((editions) => setListed({ gameId: id, editions })),
    [],
  );
  // A photo kept for this season answers the call, so a reload on the last evening asks no more.
  useEffect(() => {
    if (gameId === null) return;
    void listEditions(gameId)
      .catch(() => NONE)
      .then((editions) => setListed({ gameId, editions }));
    void readPending(gameId).then((row) => {
      if (row) showcase.current?.setPhotoCallAnswered(row.season);
    }, console.error);
  }, [showcase, gameId]);
  // Another game's list until this one's is read would offer papers that are not this game's.
  const editions = listed !== null && listed.gameId === gameId ? listed.editions : NONE;
  return { editions, refresh };
}

async function printPhoto(
  pending: PendingPhoto | null,
  fallback: Promise<FrontCapture> | null,
): Promise<{ readonly photo: Blob | null; readonly origin: EditionPhoto | null }> {
  if (pending) return { photo: pending.photo, origin: pending.origin };
  if (!fallback) return { photo: null, origin: null };
  try {
    const capture = await fallback;
    return { photo: await frontPhotoBlob(capture.pixels, NO_FILTER), origin: capture.origin };
  } catch (cause: unknown) {
    console.error(cause);
    return { photo: null, origin: null };
  }
}

const failed = (cause: unknown): false => {
  console.error(cause);
  return false;
};

// For the callbacks the showcase holds: they must reach today's state.
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function useNewspaper(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  clock: Pick<ClockControls, 'setSpeed'>,
  startFrontPage: (session: FrontPageSession) => void,
): Newspaper {
  const gameId = useHudSlice(hud, (state) => state.gameId);
  const [call, setCall] = useState<Call | null>(null);
  const [open, setOpen] = useState<OpenPaper | null>(null);
  const pending = usePending(showcase, hud);
  const archive = useArchive(showcase, gameId);
  const { keep, pendingFor, printed } = pending;
  const { refresh } = archive;

  // Drawn at once, before the clock is let go, while the evening is still full of guests.
  const fallBack = useCallback(
    (asked: Call) => {
      const capture = showcase.current?.frontFallback();
      clock.setSpeed(asked.speed);
      if (!capture) return;
      void capture
        .then((taken) => keep(taken.season, frontPhotoBlob(taken.pixels, NO_FILTER), taken.origin))
        .catch(console.error);
    },
    [showcase, clock, keep],
  );

  const take = (): void => {
    if (!call) return;
    setCall(null);
    startFrontPage({
      keep: (pixels, matrix, day, time) => {
        clock.setSpeed(call.speed);
        const origin = { from: 'player', day, minute: Math.round(time * MINUTES_PER_DAY) } as const;
        void keep(call.season, frontPhotoBlob(pixels, matrix), origin).catch(console.error);
      },
      left: () => fallBack(call),
    });
  };

  const skip = (): void => {
    if (!call) return;
    setCall(null);
    fallBack(call);
  };

  const print = useCallback(
    async (fallback: Promise<FrontCapture> | null): Promise<void> => {
      const draft = editionNow(hud.getSnapshot(), null);
      if (!draft) return;
      const kept = await pendingFor(draft.gameId, draft.season);
      const { photo, origin } = await printPhoto(kept, fallback);
      const edition = { ...draft, photo: origin };
      const stored = await printEdition(edition, photo).then(() => true, failed);
      printed();
      setOpen({ edition, photo, kept: stored, browsing: false });
      await refresh(edition.gameId);
    },
    [hud, pendingFor, printed, refresh],
  );

  const read = useCallback(
    (season: number) => {
      if (gameId === null) return;
      void readEdition(gameId, season).then((found) => {
        if (found) {
          setOpen({ edition: found.edition, photo: found.photo, kept: true, browsing: true });
        }
      }, console.error);
    },
    [gameId],
  );

  const latestPrint = useLatest(print);
  const onPhotoCall = useCallback(
    (season: number, speed: SimSpeed) => setCall({ season, speed }),
    [],
  );
  const onSeasonEnded = useCallback(
    (fallback: Promise<FrontCapture> | null) => void latestPrint.current(fallback),
    [latestPrint],
  );

  return {
    call: { season: call?.season ?? null, take, skip },
    paper: {
      editions: archive.editions,
      open,
      read,
      close: useCallback(() => setOpen(null), []),
      print: newsprintUrl,
    },
    onPhotoCall,
    onSeasonEnded,
  };
}
