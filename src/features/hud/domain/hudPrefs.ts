import type { ToastKind } from './news';
import type { PausePrefs } from './stops';

export interface HudPrefs extends PausePrefs {
  readonly muted: readonly ToastKind[];
  readonly markers: boolean;
  // Off at first: forty pins over a busy plot bury the buildings until somebody asks for them.
  readonly staff: boolean;
  readonly signs: boolean;
  readonly singleKeys: boolean;
  // On at first: the night is dark and there is little to do in it.
  readonly fastNights: boolean;
}

export const DEFAULT_PREFS: HudPrefs = {
  muted: [],
  markers: true,
  staff: false,
  signs: true,
  singleKeys: true,
  fastNights: true,
  pauseWeek: true,
  // On at first: an offer is open for a day only, which a fast clock runs through unseen.
  pauseOffers: true,
};

const TOAST_KINDS: ReadonlySet<unknown> = new Set<ToastKind>([
  'urgent',
  'warning',
  'day',
  'event',
  'booking',
]);

type Flag = Exclude<keyof HudPrefs, 'muted'>;

const isToastKind = (value: unknown): value is ToastKind => TOAST_KINDS.has(value);

// Field by field, so a preference added later reads its default from an older store.
export function parsePrefs(value: unknown): HudPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const { muted, ...flags } = value as { muted?: unknown } & {
    readonly [flag in Flag]?: unknown;
  };
  const flag = (name: Flag): boolean => {
    const given = flags[name];
    return typeof given === 'boolean' ? given : DEFAULT_PREFS[name];
  };
  return {
    muted: Array.isArray(muted) ? [...new Set(muted.filter(isToastKind))] : DEFAULT_PREFS.muted,
    markers: flag('markers'),
    staff: flag('staff'),
    signs: flag('signs'),
    singleKeys: flag('singleKeys'),
    fastNights: flag('fastNights'),
    pauseWeek: flag('pauseWeek'),
    pauseOffers: flag('pauseOffers'),
  };
}
