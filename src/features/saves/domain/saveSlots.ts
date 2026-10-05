import { SAVE_VERSION, saveMetaSchema, type SaveMeta } from './snapshot';

// The one slot a game nobody has named autosaves into.
export const UNSAVED_ID = 'unsaved';

const MAX_NAME = 40;

export type ListedSave = SaveMeta | { readonly id: string; readonly unreadable: true };

export interface CurrentGame {
  readonly id: string;
  readonly name: string | null;
}

export interface SaveTarget {
  readonly id: string;
  readonly name: string | null;
  // The slot the game leaves behind, if it moves.
  readonly drop: string | null;
}

export type SavePlan =
  | { readonly kind: 'write'; readonly target: SaveTarget }
  | { readonly kind: 'needs-name' }
  | { readonly kind: 'bad-name' }
  | { readonly kind: 'clash'; readonly with: SaveMeta };

export type SaveOutcome =
  | Exclude<SavePlan, { readonly kind: 'write' }>
  | { readonly kind: 'saved' | 'failed' };

export function isReadable(save: ListedSave): save is SaveMeta {
  return !('unreadable' in save);
}

// Another version is as unreadable as a broken record: there are no migrations.
export function listedOf(raw: unknown): ListedSave {
  const parsed = saveMetaSchema.safeParse(raw);
  if (parsed.success && parsed.data.version === SAVE_VERSION) return parsed.data;
  const id = (raw as { id?: unknown } | null)?.id;
  return { id: typeof id === 'string' ? id : '', unreadable: true };
}

export function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= MAX_NAME ? name : null;
}

export function listOrder(saves: readonly ListedSave[]): readonly ListedSave[] {
  const savedAt = (save: ListedSave): number => (isReadable(save) ? save.savedAt : -Infinity);
  return saves.toSorted((a, b) => savedAt(b) - savedAt(a) || a.id.localeCompare(b.id));
}

export function latestOf(saves: readonly ListedSave[]): SaveMeta | null {
  const newest = listOrder(saves)[0];
  return newest && isReadable(newest) ? newest : null;
}

// Case aside, two saves of one name could not be told apart in the list.
export function clashOf(
  saves: readonly ListedSave[],
  name: string,
  exceptId: string | null,
): SaveMeta | null {
  const wanted = name.toLocaleLowerCase();
  const same = (save: ListedSave): save is SaveMeta =>
    isReadable(save) && save.id !== exceptId && save.name?.toLocaleLowerCase() === wanted;
  return saves.find(same) ?? null;
}

export function targetOf(current: CurrentGame | null): string {
  return current?.id ?? UNSAVED_ID;
}

export function autosaveTarget(current: CurrentGame | null): SaveTarget {
  return { id: targetOf(current), name: current?.name ?? null, drop: null };
}

// What a form shows of the game: no game and an unnamed one both read as a blank name.
export function shownGame(current: CurrentGame | null): {
  readonly id: string | null;
  readonly name: string;
} {
  return { id: current?.id ?? null, name: current?.name ?? '' };
}

const isNamed = (current: CurrentGame | null): current is CurrentGame =>
  current !== null && current.id !== UNSAVED_ID && current.name !== null;

// A copy leaves the game it was made from standing, except the unsaved slot, which only ever
// holds the game being played.
export function planSave(parts: {
  readonly current: CurrentGame | null;
  readonly saves: readonly ListedSave[];
  readonly asked: string | undefined;
  readonly copy: boolean;
  readonly overwrite: boolean;
  readonly freshId: string;
}): SavePlan {
  const { current, copy } = parts;
  if (parts.asked === undefined) {
    return isNamed(current)
      ? { kind: 'write', target: { id: current.id, name: current.name, drop: null } }
      : { kind: 'needs-name' };
  }
  const name = cleanName(parts.asked);
  if (name === null) return { kind: 'bad-name' };
  const clash = clashOf(parts.saves, name, copy ? null : (current?.id ?? null));
  if (clash && !parts.overwrite) return { kind: 'clash', with: clash };
  const id = clash?.id ?? (copy || !isNamed(current) ? parts.freshId : current.id);
  const leaves = current !== null && current.id !== id && (!copy || current.id === UNSAVED_ID);
  return { kind: 'write', target: { id, name, drop: leaves ? current.id : null } };
}

// Naming a save that is not the game being played leaves the game as it was.
export function afterNaming(
  current: CurrentGame | null,
  from: string,
  to: CurrentGame,
): CurrentGame | null {
  return current?.id === from ? to : current;
}

// The game plays on unnamed, so the next autosave writes the unsaved slot again.
export function afterRemoving(current: CurrentGame | null, removed: string): CurrentGame | null {
  return current?.id === removed ? { id: UNSAVED_ID, name: null } : current;
}

// A save whose meta reads but whose snapshot did not is listed as it really is.
export function withUnreadable(
  saves: readonly ListedSave[],
  broken: ReadonlySet<string>,
): readonly ListedSave[] {
  return saves.map((save) => (broken.has(save.id) ? { id: save.id, unreadable: true } : save));
}

export function readableById(saves: readonly ListedSave[], id: string): SaveMeta | null {
  const found = id === 'latest' ? latestOf(saves) : saves.find((save) => save.id === id);
  return found && isReadable(found) ? found : null;
}

// A write or a load under way, either of which the slots must be left alone through.
export const slotsBusy = (saves: {
  readonly status: string;
  readonly loading: string | null;
}): boolean => saves.status === 'saving' || saves.loading !== null;

// The quick save: a named game is written over, and an unnamed one is sent to be named.
export async function saveOrAsk(
  save: () => Promise<SaveOutcome>,
  askForName: () => void,
): Promise<void> {
  if ((await save()).kind === 'needs-name') askForName();
}
