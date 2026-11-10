import { loadedShare, type LoadingStep } from './loading';

export type SkyStage = 'night' | 'dawn' | 'morning' | 'noon';

const STAGES: readonly SkyStage[] = ['night', 'dawn', 'morning', 'noon'];

// Where the sea meets the sky, as a share of the screen's height from the top.
export const HORIZON = 0.72;
// The sun is already peeking when the page opens, so the first thing seen is a dawn coming.
const PEEK = 0.1;
const SUN_FROM_X = 0.82;
const SUN_TO_X = 0.64;
const SUN_TOP = 0.2;
const SUN_BELOW = HORIZON + 0.06;

export interface SunSpot {
  readonly x: number;
  readonly y: number;
}

export function skyStage(done: readonly LoadingStep[]): SkyStage {
  return STAGES[Math.round(loadedShare(done) * (STAGES.length - 1))] ?? 'noon';
}

// A quarter arc, so it climbs fast off the horizon and slows towards the top, as a sun seems to.
export function sunAt(done: readonly LoadingStep[]): SunSpot {
  const t = PEEK + (1 - PEEK) * loadedShare(done);
  return {
    x: SUN_FROM_X + (SUN_TO_X - SUN_FROM_X) * t,
    y: SUN_BELOW - (SUN_BELOW - SUN_TOP) * Math.sin((t * Math.PI) / 2),
  };
}
