import type { GameMode } from '../../sim/domain/ledger';

// The mode is still 'sandbox' in the code: only the player-facing name changed.
export const MODE_LABELS: { readonly [mode in GameMode]: string } = {
  sandbox: 'Free play',
  tycoon: 'Tycoon',
};
