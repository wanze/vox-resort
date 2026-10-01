import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPrefs, savePrefs } from '../features/hud/adapters/prefsStore';
import type { HudPrefs } from '../features/hud/domain/hudPrefs';
import {
  expireToasts,
  logDay,
  logNews,
  newsFrom,
  showDay,
  showToasts,
  toastKey,
  withoutResolved,
  type Message,
  type Toast,
  type ToastKind,
} from '../features/hud/domain/news';
import type { Advice } from '../features/sim/domain/advice';
import type { DayReport } from '../features/sim/domain/dayReport';
import type { SimSpeed } from '../features/sim/domain/simClock';

export interface NewsControls {
  readonly toasts: readonly Toast[];
  readonly log: readonly Message[];
  readonly prefs: HudPrefs;
  hear(advice: readonly Advice[], ticks: number): void;
  closeDay(report: DayReport): void;
  dismiss(key: string): void;
  setMuted(kind: ToastKind, muted: boolean): void;
  // The next advice is a baseline: a new resort's problems are not news.
  reset(): void;
}

const TICK_MS = 1000;

const kindOfToast = (toast: Toast): ToastKind =>
  toast.kind === 'advice' ? toast.news.severity : toast.kind;

export function useNews(speed: SimSpeed): NewsControls {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [log, setLog] = useState<readonly Message[]>([]);
  const [prefs, setPrefs] = useState<HudPrefs>(loadPrefs);
  const before = useRef<readonly Advice[] | null>(null);
  const heard = useRef<ReadonlyMap<string, number>>(new Map());
  // Read through refs so `hear` stays stable: the showcase holds it from its mount on.
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
    dismiss: useCallback(
      (key: string) => setToasts((shown) => shown.filter((toast) => toastKey(toast) !== key)),
      [],
    ),
    setMuted: useCallback((kind: ToastKind, muted: boolean) => {
      setPrefs((was) => {
        const others = was.muted.filter((each) => each !== kind);
        const next = { ...was, muted: muted ? [...others, kind] : others };
        savePrefs(next);
        return next;
      });
      if (muted) setToasts((shown) => shown.filter((toast) => kindOfToast(toast) !== kind));
    }, []),
    reset: useCallback(() => {
      before.current = null;
      heard.current = new Map();
      setToasts([]);
      setLog([]);
    }, []),
  };
}
