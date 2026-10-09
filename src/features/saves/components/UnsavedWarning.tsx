import type { SaveOutcome } from '../domain/saveSlots';
import type { SaveMeta } from '../domain/snapshot';
import { NameForm } from './NameForm';

export interface UnsavedWarningProps {
  readonly unsaved: SaveMeta | null;
  readonly onKeep: (name: string, overwrite: boolean) => Promise<SaveOutcome>;
}

// A new game autosaves into the one unsaved slot, so the game there is gone unless it is named.
export function UnsavedWarning({ unsaved, onKeep }: UnsavedWarningProps) {
  if (!unsaved) return null;
  return (
    <div className="saves-warning" role="note">
      <p className="ui-note">Your unsaved game (day {unsaved.day}) will be replaced.</p>
      <NameForm initial="" disabled={false} actions={[{ label: 'Keep it as…', run: onKeep }]} />
    </div>
  );
}
