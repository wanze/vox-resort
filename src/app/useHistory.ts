import { useCallback, useRef, useState } from 'react';
import { newDayIn } from '../features/hud/domain/news';
import type { DayReport } from '../features/sim/domain/dayReport';

export interface HistoryControls {
  readonly history: readonly DayReport[];
  // The day the report window shows; null for the newest.
  readonly shown: number | null;
  readonly adopt: (history: readonly DayReport[]) => void;
  readonly show: (day: number | null) => void;
  // The next history is a baseline: the reports a load brings were closed long ago.
  readonly reset: () => void;
}

export function useHistory(onNewDay: (report: DayReport) => void): HistoryControls {
  const [history, setHistory] = useState<readonly DayReport[]>([]);
  const [shown, show] = useState<number | null>(null);
  // undefined until a resort's first history; null for a resort with none yet.
  const heard = useRef<number | null | undefined>(undefined);

  const adopt = useCallback(
    (next: readonly DayReport[]) => {
      setHistory(next);
      const fresh = newDayIn(next, heard.current);
      if (fresh) onNewDay(fresh);
      heard.current = next.at(-1)?.day ?? null;
    },
    [onNewDay],
  );

  const reset = useCallback(() => {
    heard.current = undefined;
    show(null);
  }, []);

  return { history, shown, adopt, show, reset };
}
