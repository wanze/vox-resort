export const UPDATE_CHECK_MS = 60 * 60 * 1000;

export const UPDATE_POLL_MS = 5 * 60 * 1000;

// Once one is found there is nothing more to look for: the waiting version is the newest seen.
export function updateCheckDue(parts: {
  readonly found: boolean;
  readonly online: boolean;
  readonly visible: boolean;
  readonly lastCheckedAt: number;
  readonly now: number;
}): boolean {
  if (parts.found || !parts.online || !parts.visible) return false;
  return parts.now - parts.lastCheckedAt >= UPDATE_CHECK_MS;
}
