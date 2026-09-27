import type { GameMode } from '../../sim/domain/ledger';

export type Ground = 'bare' | 'grown';

export interface NewGame {
  readonly mode: GameMode;
  readonly ground: Ground;
}

// A tycoon pays for everything that stands, so it never starts on a resort it did not build.
export function groundOf(game: NewGame): Ground {
  return game.mode === 'tycoon' ? 'bare' : game.ground;
}
