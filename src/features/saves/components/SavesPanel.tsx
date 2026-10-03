import { useState } from 'react';
import { listOrder, shownGame } from '../domain/saveSlots';
import { statusLine } from '../domain/saveWords';
import { clockTime } from './saveNames';
import { NameForm } from './NameForm';
import { SaveList } from './SaveList';
import type { SaveControls } from '../../../app/useSaves';

function SaveStatus({ saves }: { readonly saves: SaveControls }) {
  const { lastSavedAt } = saves;
  return (
    <p className="save-status" role="status">
      {statusLine({
        available: saves.available,
        status: saves.status,
        savedAt: lastSavedAt === null ? null : clockTime(lastSavedAt),
      })}
    </p>
  );
}

// The name field is keyed on the game, so a load or a rename fills it afresh. A game not saved
// under a name yet is offered the resort's.
export function SavesPanel(props: {
  readonly saves: SaveControls;
  readonly resortName: string | null;
}) {
  const { saves, resortName } = props;
  const [now] = useState(Date.now);
  const game = shownGame(saves.current);
  const busy = saves.status === 'saving' || !saves.available;
  return (
    <div className="saves-panel">
      <NameForm
        key={`${game.id}:${game.name}:${resortName}`}
        initial={game.name || (resortName ?? '')}
        disabled={busy}
        actions={[
          { label: 'Save', run: saves.save },
          { label: 'Save as new', run: saves.saveAs },
        ]}
      />
      <SaveStatus saves={saves} />
      <SaveList
        saves={listOrder(saves.saves)}
        currentId={game.id}
        busy={busy}
        now={now}
        onLoad={(id) => void saves.load(id)}
        onDelete={(id) => void saves.remove(id)}
      />
    </div>
  );
}
