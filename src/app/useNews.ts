import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPrefs, savePrefs } from '../features/hud/adapters/prefsStore';
import type { HudPrefs } from '../features/hud/domain/hudPrefs';
import {
  expireToasts,
  logDay,
  logEvent,
  logNews,
  newsFrom,
  showDay,
  showEvent,
  showToasts,
  toastKey,
  updateOnly,
  withoutResolved,
  withUpdate,
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
  };
}

export function useNews(speed: SimSpeed): NewsControls {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [log, setLog] = useState<readonly Message[]>([]);
  const { prefs, change, setMarkers, setStaffPins, setSigns } = usePrefs();
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

  const closeDay = useCallback((report: DayReport) => {
    const options = { muted: new Set(latest.current.muted), nowMs: Date.now() };
    setToasts((shown) => showDay(shown, report, options));
    setLog((kept) => logDay(kept, report));
  }, []);

  const hearEvent = useCallback((news: EventNews) => {
    const options = { muted: new Set(latest.current.muted), nowMs: Date.now() };
    setToasts((shown) => showEvent(shown, news, options));
    setLog((kept) => logEvent(kept, news));
  }, []);

  const fading = toasts.some((toast) => toast.until !== null);
  useEffect(() => {
    if (!fading) return;
    const timer = globalThis.setInterval(
      () => setToasts((shown) => expireToasts(shown, Date.now())),
      TICK_MS,
    );
    return () => globalThis.clearInterval(timer);
  }, [fading]);

  return {
    toasts,
    log,
    prefs,
    hear,
    closeDay,
    hearEvent,
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
    setSigns,
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
