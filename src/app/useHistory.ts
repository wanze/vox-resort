import { useCallback, useEffect, useRef, useState } from 'react';
import { newDayIn } from '../features/hud/domain/news';
import type { DayReport } from '../features/sim/domain/dayReport';
import type { HistoryControls } from '../features/hud/components/hudControls';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

export function useHistory(hud: HudStore, onNewDay: (report: DayReport) => void): HistoryControls {
  const history = useHudSlice(hud, (state) => state.history);
  const [shown, show] = useState<number | null>(null);
  // undefined until a resort's first history; null for a resort with none yet.
  const heard = useRef<number | null | undefined>(undefined);

  useEffect(
    () =>
      hud.watch(
        (state) => state.history,
        (next) => {
          const fresh = newDayIn(next, heard.current);
          if (fresh) onNewDay(fresh);
          heard.current = next.at(-1)?.day ?? null;
        },
      ),
    [hud, onNewDay],
  );

  const reset = useCallback(() => {
    heard.current = undefined;
    show(null);
  }, []);

  return { history, shown, show, reset };
}
