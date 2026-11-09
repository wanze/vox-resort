import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { loadPrefs, savePrefs } from '../features/hud/adapters/prefsStore';
import type { HudPrefs } from '../features/hud/domain/hudPrefs';
import type { PausePrefs } from '../features/hud/domain/stops';
import {
  expireToasts,
  logBooking,
  logDay,
  logEvent,
  logNews,
  newsFrom,
  resumeToasts,
  showBooking,
  showDay,
  showEvent,
  showToasts,
  toastKey,
  updateOnly,
  withoutResolved,
  withUpdate,
  type BookingNews,
  type EventNews,
  type Message,
  type Toast,
  type ToastKind,
  type UpdatePhase,
} from '../features/hud/domain/news';
import type { Advice } from '../features/sim/domain/advice';
import type { DayReport } from '../features/sim/domain/dayReport';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { NewsControls } from '../features/hud/components/hudControls';

const TICK_MS = 1000;

const kindOfToast = (toast: Toast): ToastKind | null => {
  if (toast.kind === 'update') return null;
  return toast.kind === 'advice' ? toast.news.severity : toast.kind;
};

function usePrefs() {
  const [prefs, setPrefs] = useState<HudPrefs>(loadPrefs);
  const change = useCallback((next: (was: HudPrefs) => HudPrefs) => {
    setPrefs((was) => {
      const changed = next(was);
      savePrefs(changed);
      return changed;
    });
  }, []);
  return {
    prefs,
    change,
    setMarkers: useCallback(
      (shown: boolean) => change((was) => ({ ...was, markers: shown })),
      [change],
    ),
    setStaffPins: useCallback(
      (shown: boolean) => change((was) => ({ ...was, staff: shown })),
      [change],
    ),
    setSigns: useCallback(
      (shown: boolean) => change((was) => ({ ...was, signs: shown })),
      [change],
    ),
    setSingleKeys: useCallback(
      (on: boolean) => change((was) => ({ ...was, singleKeys: on })),
      [change],
    ),
    setFastNights: useCallback(
      (on: boolean) => change((was) => ({ ...was, fastNights: on })),
      [change],
    ),
    setPause: useCallback(
      (pause: keyof PausePrefs, on: boolean) => change((was) => ({ ...was, [pause]: on })),
      [change],
    ),
  };
}

// Held while the player reads them, with a pointer on them or the keyboard in them.
function useFading(
  toasts: readonly Toast[],
  setToasts: Dispatch<SetStateAction<readonly Toast[]>>,
): (held: boolean) => void {
  const [held, setHeld] = useState(false);
  const fading = toasts.some((toast) => toast.until !== null);
  useEffect(() => {
    if (!fading || held) return;
    const timer = globalThis.setInterval(
      () => setToasts((shown) => expireToasts(shown, Date.now())),
      TICK_MS,
    );
    return () => globalThis.clearInterval(timer);
  }, [fading, held, setToasts]);
  return useCallback(
    (on: boolean) => {
      setHeld(on);
      if (!on) setToasts((shown) => resumeToasts(shown, Date.now()));
    },
    [setToasts],
  );
}

type Latest = RefObject<{ readonly muted: readonly ToastKind[] }>;

// Told whatever the speed, unlike the advice: each takes none of the places advice competes for.
function useTold(
  latest: Latest,
  setToasts: Dispatch<SetStateAction<readonly Toast[]>>,
  setLog: Dispatch<SetStateAction<readonly Message[]>>,
) {
  const optionsNow = useCallback(
    () => ({ muted: new Set(latest.current.muted), nowMs: Date.now() }),
    [latest],
  );
  return {
    closeDay: useCallback(
      (report: DayReport) => {
        const options = optionsNow();
        setToasts((shown) => showDay(shown, report, options));
        setLog((kept) => logDay(kept, report));
      },
      [optionsNow, setToasts, setLog],
    ),
    hearEvent: useCallback(
      (news: EventNews) => {
        const options = optionsNow();
        setToasts((shown) => showEvent(shown, news, options));
        setLog((kept) => logEvent(kept, news));
      },
      [optionsNow, setToasts, setLog],
    ),
    hearBooking: useCallback(
      (news: BookingNews) => {
        const options = optionsNow();
        setToasts((shown) => showBooking(shown, news, options));
        setLog((kept) => logBooking(kept, news));
      },
      [optionsNow, setToasts, setLog],
    ),
  };
}

export function useNews(speed: SimSpeed): NewsControls {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [log, setLog] = useState<readonly Message[]>([]);
  const {
    prefs,
    change,
    setMarkers,
    setStaffPins,
    setSigns,
    setSingleKeys,
    setFastNights,
    setPause,
  } = usePrefs();
  const before = useRef<readonly Advice[] | null>(null);
  const heard = useRef<ReadonlyMap<string, number>>(new Map());
  // Read through refs so `hear` stays stable: a watch on the HUD store holds it.
  const latest = useRef({ speed, muted: prefs.muted });
  useEffect(() => {
    latest.current = { speed, muted: prefs.muted };
  }, [speed, prefs.muted]);

  const hear = useCallback((advice: readonly Advice[], ticks: number) => {
    const found = newsFrom(before.current, advice, heard.current, ticks);
    before.current = advice;
    heard.current = found.heard;
    const options = {
      speed: latest.current.speed,
      muted: new Set(latest.current.muted),
      nowMs: Date.now(),
    };
    setToasts((shown) => showToasts(withoutResolved(shown, advice), found.news, options));
    setLog((kept) => logNews(kept, found.news));
  }, []);

  const { closeDay, hearEvent, hearBooking } = useTold(latest, setToasts, setLog);
  const hold = useFading(toasts, setToasts);

  return {
    toasts,
    log,
    prefs,
    hear,
    closeDay,
    hearEvent,
    hearBooking,
    hold,
    dismiss: useCallback(
      (key: string) => setToasts((shown) => shown.filter((toast) => toastKey(toast) !== key)),
      [],
    ),
    setMuted: useCallback(
      (kind: ToastKind, muted: boolean) => {
        change((was) => {
          const others = was.muted.filter((each) => each !== kind);
          return { ...was, muted: muted ? [...others, kind] : others };
        });
        if (muted) setToasts((shown) => shown.filter((toast) => kindOfToast(toast) !== kind));
      },
      [change],
    ),
    setMarkers,
    setStaffPins,
    setFastNights,
    setPause,
    setSigns,
    setSingleKeys,
    setUpdate: useCallback(
      (phase: UpdatePhase | null) => setToasts((shown) => withUpdate(shown, phase)),
      [],
    ),
    // A new version is not about the resort being replaced, so it stays on offer.
    reset: useCallback(() => {
      before.current = null;
      heard.current = new Map();
      setToasts(updateOnly);
      setLog([]);
    }, []),
  };
}
