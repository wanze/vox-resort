import {
  isReadable,
  type CurrentGame,
  type ListedSave,
  type SaveTarget,
} from '../../saves/domain/saveSlots';

// Null keeps everything: a save that does not read may still name a game, so nothing is safe to go.
export function keptGames(
  saves: readonly ListedSave[],
  running: string | null,
): ReadonlySet<string> | null {
  if (!saves.every(isReadable)) return null;
  const kept = new Set(
    saves.flatMap((save) => (isReadable(save) && save.gameId ? [save.gameId] : [])),
  );
  if (running !== null) kept.add(running);
  return kept;
}

// Saved as new beside the save it came from, which keeps its own id and papers. A game that
// leaves its slot behind, as the unsaved one does when named, stays the same game.
export const forksTo = (current: CurrentGame | null, target: SaveTarget, copy: boolean): boolean =>
  copy && current !== null && current.id !== target.id && target.drop === null;
