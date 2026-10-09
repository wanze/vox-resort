import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CommandList } from './CommandList';
import { useReturnFocus } from '../../../shared/components/useReturnFocus';
import type { Command } from './commands';
import { rankCommands, sectionCommands } from '../domain/commandSearch';
import { stepCursor } from '../../../shared/domain/roving';
import { keyLabel } from '../domain/keymap';

export interface CommandPaletteProps {
  readonly commands: readonly Command[];
  readonly onClose: () => void;
}

// The field keeps the focus through a click, or Escape would fall through to the game's menu.
const keepFocus = (event: PointerEvent<HTMLDivElement>): void => {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
};

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

const nowhere = (): null => null;

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  useReturnFocus(nowhere);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const sections = useMemo(() => sectionCommands(rankCommands(commands, query)), [commands, query]);
  const shown = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const active = Math.min(cursor, Math.max(shown.length - 1, 0));

  const run = (command: Command | undefined): void => {
    if (!command) return;
    onClose();
    command.run();
  };

  // Stopped here, so Escape closes the palette without also dropping the armed tool behind it.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const step = STEPS[event.key];
    if (step !== undefined) setCursor(stepCursor(active, step, shown.length));
    else if (event.key === 'Enter') run(shown[active]);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="hud-command-layer">
      <div className="ui-scrim hud-command-scrim" onPointerDown={onClose} />
      <div
        className="ui-panel hud-command"
        role="dialog"
        aria-modal="true"
        aria-label="Find an action"
        onPointerDown={keepFocus}
      >
        <div className="hud-command-search">
          <input
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown.length > 0 ? `${listId}-${active}` : undefined}
            aria-label="Find an action"
            placeholder="Find an action, a window, something to build…"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="ui-option-key">{keyLabel('cancel')}</kbd>
        </div>
        <CommandList
          id={listId}
          sections={sections}
          active={active}
          onPoint={setCursor}
          onRun={run}
        />
      </div>
    </div>
  );
}
