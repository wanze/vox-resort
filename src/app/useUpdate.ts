import { useCallback, useEffect, useRef } from 'react';
import {
  startServiceWorker,
  type ServiceWorkerControls,
} from '../features/pwa/adapters/serviceWorker';
import { UPDATE_POLL_MS, updateCheckDue } from '../features/pwa/domain/updateCheck';
import type { UpdateAction, UpdatePhase } from '../features/hud/domain/news';

// Later only takes the toast down: the waiting version takes over by itself the next time the
// game starts with no tab open, so nothing asks again this session.
export function useUpdate(
  saveBeforeReload: () => Promise<boolean>,
  setUpdate: (phase: UpdatePhase | null) => void,
  ready: boolean,
): (action: UpdateAction) => void {
  const worker = useRef<ServiceWorkerControls | null>(null);
  const checks = useRef({ found: false, lastCheckedAt: 0 });

  useEffect(() => {
    // Not before the first frame: a first visit's worker downloads the whole build, and that
    // must not compete with what draws the resort.
    if (!ready) return;
    // Registering is itself a check, so the hour runs from the registration.
    checks.current.lastCheckedAt = Date.now();
    const controls = startServiceWorker(() => {
      checks.current.found = true;
      setUpdate('ready');
    });
    worker.current = controls;
    const check = (): void => {
      const now = Date.now();
      const due = updateCheckDue({
        ...checks.current,
        online: navigator.onLine,
        visible: document.visibilityState === 'visible',
        now,
      });
      if (!due) return;
      checks.current.lastCheckedAt = now;
      controls.checkForUpdate();
    };
    const timer = globalThis.setInterval(check, UPDATE_POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      globalThis.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [setUpdate, ready]);

  return useCallback(
    (action: UpdateAction) => {
      const apply = (): void => void worker.current?.applyUpdate();
      if (action === 'later') setUpdate(null);
      else if (action === 'reload-anyway') apply();
      else {
        setUpdate('saving');
        void saveBeforeReload().then((safe) => (safe ? apply() : setUpdate('unsaved')));
      }
    },
    [saveBeforeReload, setUpdate],
  );
}
