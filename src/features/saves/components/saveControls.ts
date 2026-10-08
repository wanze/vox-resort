import type { CurrentGame, ListedSave, SaveOutcome } from '../domain/saveSlots';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface SaveControls {
  readonly saves: readonly ListedSave[];
  readonly current: CurrentGame | null;
  readonly available: boolean;
  readonly status: SaveStatus;
  readonly lastSavedAt: number | null;
  // The save being opened: a load takes seconds before the resort shows.
  readonly loading: string | null;
  // No name overwrites a named game; a name names or renames it. A clash is asked about first.
  save(name?: string, overwrite?: boolean): Promise<SaveOutcome>;
  saveAs(name: string, overwrite?: boolean): Promise<SaveOutcome>;
  // True once the save is running; the current game is autosaved before it is replaced.
  load(id: string): Promise<boolean>;
  remove(id: string): Promise<void>;
  // Moves the unsaved slot into a named one, so a new game does not replace it.
  nameUnsaved(name: string, overwrite?: boolean): Promise<SaveOutcome>;
  started(): void;
  markDirty(): void;
  morning(): void;
  // True when the game is safe to leave: saved now, nothing to save, or no game to lose.
  saveBeforeReload(): Promise<boolean>;
}
