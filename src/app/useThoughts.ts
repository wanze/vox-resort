import { useState } from 'react';
import type { VoicesView } from './showcase';

export interface ThoughtsControls {
  readonly voices: VoicesView;
  readonly adopt: (voices: VoicesView) => void;
}

const QUIET: VoicesView = { loudest: [], reviews: [] };

export function useThoughts(): ThoughtsControls {
  const [voices, adopt] = useState<VoicesView>(QUIET);
  return { voices, adopt };
}
