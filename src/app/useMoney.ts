import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildNote } from '../features/hud/domain/views';
import type { MoneyControls } from '../features/hud/components/hudControls';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';

const REFUSAL_MS = 4_000;

export function useMoney(hud: HudStore): MoneyControls {
  const ledger = useHudSlice(hud, (state) => state.ledger);
  const land = useHudSlice(hud, (state) => state.land);
  const [refusal, setRefusal] = useState<BuildNote | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const note = useCallback((shown: BuildNote) => {
    setRefusal(shown);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefusal(null), REFUSAL_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { ledger, refusal, land, note };
}
