import { registerSW } from 'virtual:pwa-register';

export interface ServiceWorkerControls {
  checkForUpdate(): void;
  applyUpdate(): Promise<void>;
}

let registration: ServiceWorkerRegistration | null = null;

// Once per page, as saveStore.ts opens its database: a remount must not register twice, but
// its callback replaces the one the first mount gave.
let started: ((reloadPage?: boolean) => Promise<void>) | null = null;
let ready: () => void = () => undefined;
// Workbox and the watch on an install already under way can both see the same version arrive.
let announced = false;

const announce = (): void => {
  if (announced) return;
  announced = true;
  ready();
};

export const installedBefore = (): boolean =>
  'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;

// Workbox only hears of installs that begin after it registered, and a returning visit registers
// while the browser's own check on navigation may still be installing the new version.
function watchInstall(registered: ServiceWorkerRegistration | undefined): void {
  const installing = registered?.installing;
  if (!installing || !installedBefore()) return;
  installing.addEventListener('statechange', () => {
    if (installing.state === 'installed') announce();
  });
}

// Without a worker the game plays on as before, only not offline. Under `pnpm dev` the plugin's
// registerSW does nothing, which keeps development and the bench free of a worker.
export function startServiceWorker(onUpdateReady: () => void): ServiceWorkerControls {
  ready = onUpdateReady;
  started ??= registerSW({
    immediate: true,
    onNeedRefresh: announce,
    onRegisteredSW: (_url, registered) => {
      registration = registered ?? null;
      watchInstall(registered);
    },
    onRegisterError: (cause: unknown) => console.error(cause),
  });
  const updateSW = started;
  return {
    checkForUpdate() {
      if (!registration || registration.installing) return;
      // A failed network check is what offline looks like; the next one tries again.
      registration.update().catch(() => undefined);
    },
    applyUpdate: () => updateSW(true),
  };
}
