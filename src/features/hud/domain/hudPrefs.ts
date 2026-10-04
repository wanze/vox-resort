import type { ToastKind } from './news';

export interface HudPrefs {
  readonly muted: readonly ToastKind[];
  readonly markers: boolean;
  // Off at first: forty pins over a busy plot bury the buildings until somebody asks for them.
  readonly staff: boolean;
  readonly signs: boolean;
}

export const DEFAULT_PREFS: HudPrefs = {
  muted: [],
  markers: true,
  staff: false,
  signs: true,
};

const TOAST_KINDS: ReadonlySet<unknown> = new Set<ToastKind>(['urgent', 'warning', 'day', 'event']);

const isToastKind = (value: unknown): value is ToastKind => TOAST_KINDS.has(value);

// Field by field, so a preference added later reads its default from an older store.
export function parsePrefs(value: unknown): HudPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const { muted, markers, staff, signs } = value as {
    muted?: unknown;
    markers?: unknown;
    staff?: unknown;
    signs?: unknown;
  };
  return {
    muted: Array.isArray(muted) ? [...new Set(muted.filter(isToastKind))] : DEFAULT_PREFS.muted,
    markers: typeof markers === 'boolean' ? markers : DEFAULT_PREFS.markers,
    staff: typeof staff === 'boolean' ? staff : DEFAULT_PREFS.staff,
    signs: typeof signs === 'boolean' ? signs : DEFAULT_PREFS.signs,
  };
}
