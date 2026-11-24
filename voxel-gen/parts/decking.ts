import { courseOf, type RampFinish } from './flight.ts';

// Shared so a wooden flight reads as the boardwalk it continues.
export const DECKING = {
  joist: 0x6b563c,
  boards: [0xb98f5f, 0xa87f52, 0xc59a68],
} as const;

export const DECK_BOARD_DEPTH = 4;

// The lightest board, so the flank under the railing is one face rather than joist and plank.
export const DECK_FLANK = DECKING.boards[2];

// One board to a course: a joist line as well as the riser drew two lines to every step.
export const DECK_RAMP: RampFinish = {
  bank: DECKING.joist,
  flank: DECK_FLANK,
  surface: (_x, row) => DECKING.boards[courseOf(row) % DECKING.boards.length]!,
};
