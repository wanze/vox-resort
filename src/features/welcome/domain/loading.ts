// The models and the resort are prepared side by side, so either may finish first; the scene is
// last, done once its first frame is drawn, which is when the shaders have been built.
const LOADING_STEPS = ['models', 'resort', 'scene'] as const;

export type LoadingStep = (typeof LOADING_STEPS)[number];

// The first line names the step plainly; the rest only colour the wait while it lasts.
const LOADING_LINES: { readonly [step in LoadingStep]: readonly [string, ...string[]] } = {
  models: [
    'Carving the voxel models',
    'Sanding the corners off the cubes',
    'Counting the deckchairs',
    'Painting the beach towels',
    'Polishing the seashells',
    'Teaching the palm trees to sway',
  ],
  resort: [
    'Laying out the resort',
    'Raking the sand',
    'Pacing out the promenade',
    'Unrolling the boardwalk',
    'Hanging up the room keys',
    'Checking the tide tables',
  ],
  scene: [
    'Lighting the scene',
    'Warming up the sun',
    'Topping up the sea',
    'Telling the seagulls the rules',
    'Fluffing the clouds',
  ],
};

export function loadedShare(done: readonly LoadingStep[]): number {
  return LOADING_STEPS.filter((step) => done.includes(step)).length / LOADING_STEPS.length;
}

export function stepUnderway(done: readonly LoadingStep[]): LoadingStep | null {
  return LOADING_STEPS.find((step) => !done.includes(step)) ?? null;
}

export function loadingLine(step: LoadingStep, turn: number): string {
  const lines = LOADING_LINES[step];
  return lines[turn % lines.length] ?? lines[0];
}
