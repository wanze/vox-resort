import { useState } from 'react';

export interface PendingControls {
  readonly pending: boolean;
  readonly adopt: (pending: boolean) => void;
}

export function usePending(): PendingControls {
  const [pending, adopt] = useState(false);
  return { pending, adopt };
}
