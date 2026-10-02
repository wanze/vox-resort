import { BARE_WORLD_TILES } from '../../land/domain/landRights';
import type { ResortParams } from '../../layout/domain/resortGenerator';
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

// Bare land is a fixed world the player buys into, so its size is never asked.
export function paramsFor(game: NewGame, draft: ResortParams): ResortParams {
  if (groundOf(game) !== 'bare') return draft;
  return { ...draft, tilesX: BARE_WORLD_TILES, tilesZ: BARE_WORLD_TILES };
}
