import { useCallback, useState, type RefObject } from 'react';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { groundOf, type NewGame } from '../features/welcome/domain/newGame';
import type { StaffRole } from '../features/sim/domain/staff';
import type { SharedResort } from '../features/sharing/domain/sharedResort';
import type { Showcase } from './showcase';
import { useMoney } from './useMoney';
import type { ResortControls } from '../features/hud/components/hudControls';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

// onStarted is told once the new resort stands, so its first save can be written at once.
export function useResortControls(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  onStarted: () => void,
): ResortControls {
  const [params, setParams] = useState<ResortParams | null>(null);
  const [building, setBuilding] = useState(false);
  const open = useHudSlice(hud, (state) => state.open);
  const name = useHudSlice(hud, (state) => state.name);
  const money = useMoney(hud);

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
    // Answered through the HUD store, as setOpen is.
    rename: useCallback((next: string) => showcase.current?.rename(next), [showcase]),
    // The showcase answers through the HUD store, so the state follows what it did.
    setOpen: useCallback((next: boolean) => showcase.current?.setOpen(next), [showcase]),
    setHiring: useCallback(
      (role: StaffRole, count: number | null) => showcase.current?.setHiring(role, count),
      [showcase],
    ),
    setPrice: useCallback(
      (family: string, factor: number | null) => showcase.current?.setPrice(family, factor),
      [showcase],
    ),
    start,
    openShared,
  };
}
