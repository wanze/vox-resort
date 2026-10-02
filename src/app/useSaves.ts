import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { parseBenchConfig } from '../features/bench/domain/benchConfig';
import {
  askToKeepSaves,
  listSaves,
  moveSave,
  readSave,
  removeSave,
  SavesUnavailable,
  writeSave,
} from '../features/saves/adapters/saveStore';
import {
  AUTOSAVE_CHECK_MS,
  autosaveDue,
  type AutosaveTrigger,
} from '../features/saves/domain/autosave';
import {
  afterNaming,
  afterRemoving,
  autosaveTarget,
  planSave,
  readableById,
  UNSAVED_ID,
  withUnreadable,
  type CurrentGame,
  type ListedSave,
  type SaveOutcome,
  type SaveTarget,
} from '../features/saves/domain/saveSlots';
import { metaOf, type GameSnapshot, type SaveMeta } from '../features/saves/domain/snapshot';
import type { Showcase } from './showcase';

// A benchmark's scene must not be written over the player's saves, nor pay for writing it.
const BENCHING = parseBenchConfig(globalThis.location?.search ?? '') !== null;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface SaveControls {
  readonly saves: readonly ListedSave[];
  readonly current: CurrentGame | null;
  readonly available: boolean;
  readonly status: SaveStatus;
  readonly lastSavedAt: number | null;
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

const freshId = (): string =>
  `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// For the callbacks the timers and the page events hold: they must read today's state.
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

interface SaveStore {
  readonly saves: readonly ListedSave[];
  readonly available: boolean;
  readonly status: SaveStatus;
  readonly lastSavedAt: number | null;
  readonly setStatus: (status: SaveStatus) => void;
  readonly saved: (at: number) => void;
  readonly fail: (cause: unknown) => void;
  readonly refresh: () => Promise<void>;
  readonly broke: (id: string) => void;
}

function useSaveStore(): SaveStore {
  const [listed, setListed] = useState<readonly ListedSave[]>([]);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const [available, setAvailable] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Reported once and kept: without IndexedDB every later call fails the same way.
  const fail = useCallback((cause: unknown) => {
    console.error(cause);
    setStatus('failed');
    if (cause instanceof SavesUnavailable) setAvailable(false);
  }, []);

  const refresh = useCallback(() => listSaves().then(setListed, fail), [fail]);

  useEffect(() => {
    let live = true;
    listSaves().then((found) => live && setListed(found), fail);
    return () => {
      live = false;
    };
  }, [fail]);

  return {
    saves: useMemo(() => withUnreadable(listed, broken), [listed, broken]),
    available,
    status,
    lastSavedAt,
    setStatus,
    saved: useCallback((at: number) => {
      setLastSavedAt(at);
      setStatus('saved');
    }, []),
    fail,
    refresh,
    broke: useCallback((id: string) => setBroken((known) => new Set([...known, id])), []),
  };
}

// Best effort on the way out: a closing tab may not wait for IndexedDB to finish.
function useAutosaveTriggers(autosave: (trigger: AutosaveTrigger) => Promise<void>): void {
  useEffect(() => {
    const timer = globalThis.setInterval(() => void autosave('timer'), AUTOSAVE_CHECK_MS);
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') void autosave('hidden');
    };
    const leaving = (): void => void autosave('hidden');
    document.addEventListener('visibilitychange', hidden);
    globalThis.addEventListener('pagehide', leaving);
    return () => {
      globalThis.clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      globalThis.removeEventListener('pagehide', leaving);
    };
  }, [autosave]);
}

// Dirty is cleared as the snapshot is taken, so a change while the write is under way still counts.
async function writeGame(
  mounted: Showcase | null,
  target: SaveTarget,
  dirty: RefObject<boolean>,
): Promise<number> {
  if (!mounted) throw new Error('There is no game to save yet');
  const snapshot = mounted.snapshot();
  dirty.current = false;
  const now = Date.now();
  await writeSave(metaOf(target.id, target.name, snapshot, now), snapshot, target.drop);
  return now;
}

// Null when the snapshot does not read, which the list then shows.
async function openGame(mounted: Showcase, meta: SaveMeta): Promise<GameSnapshot | null> {
  const snapshot = await readSave(meta.id);
  if (snapshot) await mounted.load(snapshot);
  return snapshot;
}

// Listed afresh: the autosave just before may have rewritten the slot the list still shows.
async function moveUnsaved(named: CurrentGame): Promise<boolean> {
  const unsaved = readableById(await listSaves(), UNSAVED_ID);
  if (!unsaved) return false;
  await moveSave(UNSAVED_ID, { ...unsaved, ...named });
  return true;
}

// Resolves either way; a failure is reported and answered false.
function settled<T>(work: Promise<T>, fail: (cause: unknown) => void): Promise<T | false> {
  return work.catch((cause: unknown) => {
    fail(cause);
    return false as const;
  });
}

// Waits out a write that starts while the one before it is finishing, answering for the last.
async function writesDone(
  inFlight: RefObject<Promise<boolean> | null>,
  earlier = true,
): Promise<boolean> {
  const pending = inFlight.current;
  return pending ? writesDone(inFlight, await pending) : earlier;
}

interface Session {
  readonly store: SaveStore;
  readonly current: CurrentGame | null;
  readonly currentRef: RefObject<CurrentGame | null>;
  readonly savesRef: RefObject<readonly ListedSave[]>;
  readonly dirtyRef: RefObject<boolean>;
  readonly lastSavedRef: RefObject<number | null>;
  readonly follow: (next: CurrentGame | null) => void;
}

function useSession(): Session {
  const store = useSaveStore();
  const [current, setCurrent] = useState<CurrentGame | null>(null);
  const currentRef = useLatest(current);
  const follow = useCallback(
    (next: CurrentGame | null) => {
      currentRef.current = next;
      setCurrent(next);
    },
    [currentRef],
  );
  return {
    store,
    current,
    currentRef,
    savesRef: useLatest(store.saves),
    dirtyRef: useRef(false),
    lastSavedRef: useRef<number | null>(null),
    follow,
  };
}

function useWriter(showcaseRef: RefObject<Showcase | null>, session: Session, playing: boolean) {
  const { store, currentRef, dirtyRef, lastSavedRef, follow } = session;
  const { setStatus, saved, refresh, fail } = store;
  const enabledRef = useLatest(playing && !BENCHING);
  const writing = useRef(false);
  // So a reload can wait for it rather than start a second write to the same slot.
  const inFlight = useRef<Promise<boolean> | null>(null);
  const keptAsked = useRef(false);

  const writeNow = useCallback(
    async (target: SaveTarget): Promise<boolean> => {
      writing.current = true;
      setStatus('saving');
      const at = await settled(writeGame(showcaseRef.current, target, dirtyRef), fail);
      writing.current = false;
      if (at === false) return false;
      lastSavedRef.current = at;
      saved(at);
      follow({ id: target.id, name: target.name });
      if (!keptAsked.current) {
        keptAsked.current = true;
        void askToKeepSaves();
      }
      await refresh();
      return true;
    },
    [showcaseRef, setStatus, dirtyRef, fail, lastSavedRef, saved, follow, refresh],
  );

  const write = useCallback(
    (target: SaveTarget): Promise<boolean> => {
      const pending = writeNow(target);
      inFlight.current = pending;
      void pending.finally(() => {
        if (inFlight.current === pending) inFlight.current = null;
      });
      return pending;
    },
    [writeNow],
  );

  const autosave = useCallback(
    async (trigger: AutosaveTrigger): Promise<void> => {
      const due = autosaveDue({
        enabled: enabledRef.current,
        busy: writing.current,
        dirty: dirtyRef.current,
        lastSavedAt: lastSavedRef.current,
        now: Date.now(),
        trigger,
      });
      if (due) await write(autosaveTarget(currentRef.current));
    },
    [enabledRef, dirtyRef, lastSavedRef, currentRef, write],
  );

  // A write already under way answers for the changes it took: dirty was cleared as it began.
  const saveBeforeReload = useCallback(async (): Promise<boolean> => {
    const earlier = await writesDone(inFlight);
    const due = autosaveDue({
      enabled: enabledRef.current,
      busy: writing.current,
      dirty: dirtyRef.current,
      lastSavedAt: lastSavedRef.current,
      now: Date.now(),
      trigger: 'update',
    });
    return due ? write(autosaveTarget(currentRef.current)) : earlier;
  }, [enabledRef, dirtyRef, lastSavedRef, currentRef, write]);

  return { write, autosave, saveBeforeReload };
}

function useLoader(
  showcaseRef: RefObject<Showcase | null>,
  session: Session,
  autosave: (trigger: AutosaveTrigger) => Promise<void>,
  onLoaded: (snapshot: GameSnapshot) => void,
) {
  const { store, savesRef, dirtyRef, lastSavedRef, follow } = session;
  const { fail, broke } = store;
  const loadedRef = useLatest(onLoaded);
  return useCallback(
    async (id: string): Promise<boolean> => {
      const meta = readableById(savesRef.current, id);
      const mounted = showcaseRef.current;
      if (!meta || !mounted) return false;
      await autosave('hidden');
      const snapshot = await settled(openGame(mounted, meta), fail);
      if (!snapshot) {
        broke(meta.id);
        return false;
      }
      dirtyRef.current = false;
      lastSavedRef.current = Date.now();
      follow({ id: meta.id, name: meta.name });
      loadedRef.current(snapshot);
      return true;
    },
    [savesRef, showcaseRef, autosave, fail, broke, dirtyRef, lastSavedRef, follow, loadedRef],
  );
}

function useSlots(session: Session, autosave: (trigger: AutosaveTrigger) => Promise<void>) {
  const { store, currentRef, savesRef, dirtyRef, follow } = session;
  const { fail, refresh } = store;

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if ((await settled(removeSave(id), fail)) === false) return;
      follow(afterRemoving(currentRef.current, id));
      // So the game, if it was the one deleted, is autosaved into the unsaved slot again.
      dirtyRef.current = true;
      await refresh();
    },
    [fail, follow, currentRef, dirtyRef, refresh],
  );

  // Brought up to date first, when the unsaved slot is the game being played.
  const nameUnsaved = useCallback(
    async (asked: string, overwrite = false): Promise<SaveOutcome> => {
      await autosave('hidden');
      const plan = planSave({
        current: { id: UNSAVED_ID, name: null },
        saves: savesRef.current,
        asked,
        copy: false,
        overwrite,
        freshId: freshId(),
      });
      if (plan.kind !== 'write') return plan;
      const named = { id: plan.target.id, name: plan.target.name };
      if (!(await settled(moveUnsaved(named), fail))) return { kind: 'failed' };
      follow(afterNaming(currentRef.current, UNSAVED_ID, named));
      await refresh();
      return { kind: 'saved' };
    },
    [autosave, savesRef, fail, follow, currentRef, refresh],
  );

  return { remove, nameUnsaved };
}

export function useSaves(
  showcaseRef: RefObject<Showcase | null>,
  playing: boolean,
  onLoaded: (snapshot: GameSnapshot) => void,
): SaveControls {
  const session = useSession();
  const { store, currentRef, savesRef, dirtyRef } = session;
  const { write, autosave, saveBeforeReload } = useWriter(showcaseRef, session, playing);
  const load = useLoader(showcaseRef, session, autosave, onLoaded);
  const { remove, nameUnsaved } = useSlots(session, autosave);

  const saveWith = useCallback(
    async (asked: string | undefined, copy: boolean, overwrite: boolean): Promise<SaveOutcome> => {
      const plan = planSave({
        current: currentRef.current,
        saves: savesRef.current,
        asked,
        copy,
        overwrite,
        freshId: freshId(),
      });
      if (plan.kind !== 'write') return plan;
      return { kind: (await write(plan.target)) ? 'saved' : 'failed' };
    },
    [currentRef, savesRef, write],
  );

  // Written at once rather than on the next autosave: until then the game is in no slot at all.
  const started = useCallback(() => {
    dirtyRef.current = true;
    void write({ id: UNSAVED_ID, name: null, drop: null });
  }, [dirtyRef, write]);

  useAutosaveTriggers(autosave);

  return {
    saves: store.saves,
    current: session.current,
    available: store.available,
    status: store.status,
    lastSavedAt: store.lastSavedAt,
    save: useCallback((name, overwrite = false) => saveWith(name, false, overwrite), [saveWith]),
    saveAs: useCallback((name, overwrite = false) => saveWith(name, true, overwrite), [saveWith]),
    load,
    remove,
    nameUnsaved,
    started,
    markDirty: useCallback(() => {
      dirtyRef.current = true;
    }, [dirtyRef]),
    morning: useCallback(() => void autosave('morning'), [autosave]),
    saveBeforeReload,
  };
}
