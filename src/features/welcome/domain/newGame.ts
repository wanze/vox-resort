import { BARE_WORLD_TILES } from '../../land/domain/landRights';
import { cleanResortName, resortNameFor } from '../../naming/domain/resortName';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import type { GameMode } from '../../sim/domain/ledger';

export type Ground = 'bare' | 'grown';

export interface NewGame {
  readonly mode: GameMode;
  readonly ground: Ground;
  readonly name: string;
}

type Start = Pick<NewGame, 'mode' | 'ground'>;

// A tycoon pays for everything that stands, so it never starts on a resort it did not build.
export function groundOf(game: Start): Ground {
  return game.mode === 'tycoon' ? 'bare' : game.ground;
}

// Bare land is a fixed world the player buys into, so its size is never asked.
export function paramsFor(game: Start, draft: ResortParams): ResortParams {
  if (groundOf(game) !== 'bare') return draft;
  return { ...draft, tilesX: BARE_WORLD_TILES, tilesZ: BARE_WORLD_TILES };
}

// A field left empty still names the resort: there is never a game without one.
export function nameFor(typed: string, seed: number): string {
  return cleanResortName(typed) ?? resortNameFor(seed);
}
