import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ledger } from '../features/sim/domain/ledger';

export interface MoneyControls {
  readonly ledger: Ledger | null;
  readonly refusal: string | null;
  readonly adopt: (ledger: Ledger) => void;
  readonly refuse: (message: string) => void;
}

const REFUSAL_MS = 4_000;

export function useMoney(): MoneyControls {
  const [ledger, adopt] = useState<Ledger | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refuse = useCallback((message: string) => {
    setRefusal(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefusal(null), REFUSAL_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { ledger, refusal, adopt, refuse };
}
