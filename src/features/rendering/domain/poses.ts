// Continues crowd.ts's RESTING, which the crowd itself sets; these are only ever drawn.
export const DRAWN_POSE = {
  swim: 4,
  wade: 5,
  hop: 6,
  cheer: 7,
  jog: 8,
  strike: 9,
  reach: 10,
} as const;

// Short of 1, so the shader's floor still reads the code the progress was added to.
export const poseWith = (code: number, progress: number): number =>
  code + Math.min(Math.max(progress, 0), 0.999);
