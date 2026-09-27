// The models and the resort are prepared side by side, so either may finish first; the scene is
// last, done once its first frame is drawn, which is when the shaders have been built.
const LOADING_STEPS = ['models', 'resort', 'scene'] as const;

export type LoadingStep = (typeof LOADING_STEPS)[number];

export function loadedShare(done: readonly LoadingStep[]): number {
  return LOADING_STEPS.filter((step) => done.includes(step)).length / LOADING_STEPS.length;
}

export function stepUnderway(done: readonly LoadingStep[]): LoadingStep | null {
  return LOADING_STEPS.find((step) => !done.includes(step)) ?? null;
}
