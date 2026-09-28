import { MODE_LABELS } from '../../welcome/components/modeNames';
import { savedAgo } from '../domain/saveWords';
import type { SaveMeta } from '../domain/snapshot';

// Free play has no money worth naming, so only a tycoon game shows its balance.
export function summaryOf(meta: SaveMeta, now: number): string {
  const money = meta.mode === 'tycoon' ? [meta.balance.toLocaleString('en-US')] : [];
  return [MODE_LABELS[meta.mode], `day ${meta.day}`, ...money, savedAgo(meta.savedAt, now)].join(
    ' · ',
  );
}

export const clockTime = (at: number): string =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
