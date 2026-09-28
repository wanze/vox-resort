import type { SaveOutcome } from './saveSlots';
import type { SaveMeta } from './snapshot';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function titleOf(meta: Pick<SaveMeta, 'name'>): string {
  return meta.name ?? 'Unsaved game';
}

// Whole units, rounded down: "1 h ago" for 119 minutes reads truer than "2 h".
export function savedAgo(savedAt: number, now: number): string {
  const gone = Math.max(0, now - savedAt);
  if (gone < MINUTE) return 'just now';
  if (gone < HOUR) return `${Math.floor(gone / MINUTE)} min ago`;
  if (gone < DAY) return `${Math.floor(gone / HOUR)} h ago`;
  const days = Math.floor(gone / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// A clash asks: the answer is the same save again, told to replace the other one.
export function replyFor(
  outcome: SaveOutcome | null,
): { readonly text: string; readonly asks: boolean } | null {
  const text = outcomeMessage(outcome);
  return text === null ? null : { text, asks: outcome?.kind === 'clash' };
}

export function outcomeMessage(outcome: SaveOutcome | null): string | null {
  switch (outcome?.kind) {
    case 'bad-name':
      return 'A name is 1 to 40 characters long.';
    case 'needs-name':
      return 'Give the game a name first.';
    case 'clash':
      return `There is already a save called “${titleOf(outcome.with)}”. Replace it?`;
    case 'failed':
      return 'The game could not be saved.';
    default:
      return null;
  }
}

// The clock time is passed in already written, so the words stay free of the locale.
export function statusLine(parts: {
  readonly available: boolean;
  readonly status: 'idle' | 'saving' | 'saved' | 'failed';
  readonly savedAt: string | null;
}): string {
  if (!parts.available) return 'Saving is not available in this browser';
  if (parts.status === 'saving') return 'Saving…';
  if (parts.status === 'failed') return 'The last save failed';
  return parts.savedAt === null ? 'Not saved yet' : `Saved ${parts.savedAt}`;
}
