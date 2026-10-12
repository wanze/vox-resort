import { useEffect } from 'react';
import { startTracking } from '../features/analytics/adapters/tracker';
import { playedOf } from '../features/analytics/domain/gameEvents';
import type { HudStore } from '../features/hud/domain/hudStore';
import { installedBefore } from '../features/pwa/adapters/serviceWorker';
import { parseLink } from '../features/sharing/domain/shareLink';

// A worker already in control means this browser has played here before, which tells a
// returning player without a visitor ID.
export function useAnalytics(hud: HudStore): void {
  useEffect(() => {
    startTracking({
      returning: installedBefore(),
      entry: parseLink(globalThis.location.hash) === null ? 'direct' : 'link',
      summary: (visibleMs) => playedOf(hud.getSnapshot(), visibleMs),
    });
  }, [hud]);
}
