import { useState } from 'react';
import type { StatusView } from './showcase';

export interface StatusControls {
  readonly status: StatusView | null;
  readonly adopt: (status: StatusView) => void;
}

export function useStatus(): StatusControls {
  const [status, adopt] = useState<StatusView | null>(null);
  return { status, adopt };
}
