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

// Without a worker the game plays on as before, only not offline. Under `pnpm dev` the plugin's
// registerSW does nothing, which keeps development and the bench free of a worker.
export function startServiceWorker(onUpdateReady: () => void): ServiceWorkerControls {
  ready = onUpdateReady;
  started ??= registerSW({
    immediate: true,
    onNeedRefresh: () => ready(),
    onRegisteredSW: (_url, registered) => {
      registration = registered ?? null;
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
