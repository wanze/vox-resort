import { useCallback, useState, type RefObject } from 'react';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { groundOf, type NewGame } from '../features/welcome/domain/newGame';
import type { StaffRole } from '../features/sim/domain/staff';
import type { SharedResort } from '../features/sharing/domain/sharedResort';
import type { Showcase } from './showcase';
import { useMoney, type MoneyControls } from './useMoney';

export interface ResortControls {
  readonly params: ResortParams | null;
  readonly name: string | null;
  readonly building: boolean;
  readonly open: boolean;
  readonly money: MoneyControls;
  adopt(params: ResortParams): void;
  adoptOpen(open: boolean): void;
  adoptName(name: string): void;
  rename(name: string): void;
  setOpen(open: boolean): void;
  setHiring(role: StaffRole, count: number | null): void;
  // True once the new resort stands; false if it could not be built.
  start(params: ResortParams, game: NewGame): Promise<boolean>;
  // As start: true once the shared resort stands, false if it could not be built.
  openShared(shared: SharedResort): Promise<boolean>;
}

// onStarted is told once the new resort stands, so its first save can be written at once.
export function useResortControls(
  showcase: RefObject<Showcase | null>,
  onStarted: () => void,
): ResortControls {
  const [params, setParams] = useState<ResortParams | null>(null);
  const [building, setBuilding] = useState(false);
  const [open, adoptOpen] = useState(true);
  const [name, adoptName] = useState<string | null>(null);
  const money = useMoney();

  const start = useCallback(
    async (next: ResortParams, game: NewGame): Promise<boolean> => {
      const mounted = showcase.current;
      if (!mounted) return false;
      setBuilding(true);
      // Optimistic; the showcase's own clamped answer replaces it once the work is done.
      setParams(next);
      try {
        await (groundOf(game) === 'grown'
          ? mounted.generate(next)
          : mounted.clear(next, game.mode));
        setParams(mounted.params);
        // Before onStarted, so the first save already has it.
        mounted.rename(game.name);
        onStarted();
        return true;
      } catch (cause: unknown) {
        console.error(cause);
        return false;
      } finally {
        setBuilding(false);
      }
    },
    [showcase, onStarted],
  );

  const openShared = useCallback(
    async (shared: SharedResort): Promise<boolean> => {
      const mounted = showcase.current;
      if (!mounted) return false;
      setBuilding(true);
      try {
        await mounted.openShared(shared);
        setParams(mounted.params);
        onStarted();
        return true;
      } catch (cause: unknown) {
        console.error(cause);
        return false;
      } finally {
        setBuilding(false);
      }
    },
    [showcase, onStarted],
  );

  return {
    params,
    name,
    building,
    open,
    money,
    adopt: setParams,
    adoptOpen,
    adoptName,
    // Answered through onNameChange, as setOpen is through onOpenChange.
    rename: useCallback((next: string) => showcase.current?.rename(next), [showcase]),
    // The showcase answers through onOpenChange, so the state follows what it did.
    setOpen: useCallback((next: boolean) => showcase.current?.setOpen(next), [showcase]),
    setHiring: useCallback(
      (role: StaffRole, count: number | null) => showcase.current?.setHiring(role, count),
      [showcase],
    ),
    start,
    openShared,
  };
}
