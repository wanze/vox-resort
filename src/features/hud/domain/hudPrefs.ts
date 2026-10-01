import type { Severity } from './news';

export interface HudPrefs {
  readonly muted: readonly Severity[];
}

export const DEFAULT_PREFS: HudPrefs = { muted: [] };

const SEVERITIES: ReadonlySet<unknown> = new Set<Severity>(['urgent', 'warning']);

const isSeverity = (value: unknown): value is Severity => SEVERITIES.has(value);

// Field by field, so a preference added later reads its default from an older store.
export function parsePrefs(value: unknown): HudPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const { muted } = value as { muted?: unknown };
  return {
    muted: Array.isArray(muted) ? [...new Set(muted.filter(isSeverity))] : DEFAULT_PREFS.muted,
  };
}
