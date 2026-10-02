import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ledger } from '../features/sim/domain/ledger';
import type { BuildNote } from './showcase';

export interface MoneyControls {
  readonly ledger: Ledger | null;
  readonly refusal: BuildNote | null;
  readonly adopt: (ledger: Ledger) => void;
  readonly refuse: (message: string) => void;
  readonly note: (note: BuildNote) => void;
}

const REFUSAL_MS = 4_000;

export function useMoney(): MoneyControls {
  const [ledger, adopt] = useState<Ledger | null>(null);
  const [refusal, setRefusal] = useState<BuildNote | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const note = useCallback((shown: BuildNote) => {
    setRefusal(shown);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefusal(null), REFUSAL_MS);
  }, []);

  const refuse = useCallback(
    (message: string) => note({ title: 'Not enough money', message }),
    [note],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { ledger, refusal, adopt, refuse, note };
}
