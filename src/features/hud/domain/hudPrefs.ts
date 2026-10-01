import type { ToastKind } from './news';

export interface HudPrefs {
  readonly muted: readonly ToastKind[];
  readonly markers: boolean;
}

export const DEFAULT_PREFS: HudPrefs = { muted: [], markers: true };

const TOAST_KINDS: ReadonlySet<unknown> = new Set<ToastKind>(['urgent', 'warning', 'day']);

const isToastKind = (value: unknown): value is ToastKind => TOAST_KINDS.has(value);

// Field by field, so a preference added later reads its default from an older store.
export function parsePrefs(value: unknown): HudPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const { muted, markers } = value as { muted?: unknown; markers?: unknown };
  return {
    muted: Array.isArray(muted) ? [...new Set(muted.filter(isToastKind))] : DEFAULT_PREFS.muted,
    markers: typeof markers === 'boolean' ? markers : DEFAULT_PREFS.markers,
  };
}
