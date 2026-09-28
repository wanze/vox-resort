export const AUTOSAVE_INTERVAL_MS = 120_000;

// How often the timer asks, well inside the interval so a save is never much later than due.
export const AUTOSAVE_CHECK_MS = 30_000;

export type AutosaveTrigger = 'timer' | 'morning' | 'hidden';

// The morning and a hidden tab save whatever changed; the timer only once the interval is up.
// Never while another save is being written: the two would race to the same slot.
export function autosaveDue(parts: {
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly lastSavedAt: number | null;
  readonly now: number;
  readonly trigger: AutosaveTrigger;
}): boolean {
  if (!parts.enabled || parts.busy || !parts.dirty) return false;
  if (parts.trigger !== 'timer' || parts.lastSavedAt === null) return true;
  return parts.now - parts.lastSavedAt >= AUTOSAVE_INTERVAL_MS;
}
