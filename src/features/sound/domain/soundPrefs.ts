import type { Bus } from './bank';

export interface SoundPrefs {
  readonly on: boolean;
  readonly master: number;
  readonly music: number;
  readonly ambience: number;
  readonly effects: number;
  readonly interface: number;
}

// Music lower than the rest: it plays all the time, and the world should be heard over it.
export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  on: true,
  master: 0.8,
  music: 0.5,
  ambience: 0.8,
  effects: 0.8,
  interface: 0.6,
};

export const VOLUMES = ['master', 'music', 'ambience', 'effects', 'interface'] as const;

export type Volume = (typeof VOLUMES)[number];

const levelOf = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

// Field by field, so a setting added later reads its default from an older store.
export function parseSoundPrefs(value: unknown): SoundPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_SOUND_PREFS;
  const stored = value as { readonly [field: string]: unknown };
  const levels = Object.fromEntries(
    VOLUMES.map((volume) => [volume, levelOf(stored[volume], DEFAULT_SOUND_PREFS[volume])]),
  ) as { readonly [volume in Volume]: number };
  return {
    on: typeof stored.on === 'boolean' ? stored.on : DEFAULT_SOUND_PREFS.on,
    ...levels,
  };
}

export function busGain(prefs: SoundPrefs, bus: Bus): number {
  return prefs.on ? prefs.master * prefs[bus] : 0;
}
