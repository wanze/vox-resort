// Continues crowd.ts's RESTING, which the crowd itself sets; these are only ever drawn.
export const DRAWN_POSE = {
  swim: 4,
  wade: 5,
  hop: 6,
  cheer: 7,
  jog: 8,
  strike: 9,
  reach: 10,
  selfie: 11,
  photo: 12,
  // On the ground or along a lounger, legs out in front: RESTING.sitting hangs them off a seat.
  sitFlat: 13,
  // Sat as RESTING.sitting, but on a moving slide or boat, so the hands do not sip.
  ride: 14,
} as const;

// Short of 1, so the shader's floor still reads the code the progress was added to.
export const poseWith = (code: number, progress: number): number =>
  code + Math.min(Math.max(progress, 0), 0.999);

// What RESTING.standing's progress carries, in quarters as TALK does for sitting: standing with
// the party, already turned to them, or waiting in line with time to kill.
export const STANDING = { still: 0, waiting: 1, talking: 2 } as const;
