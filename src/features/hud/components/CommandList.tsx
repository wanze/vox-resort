import { useEffect, useRef } from 'react';
import { PixelIcon } from './PixelIcon';
import type { Command, CommandArt } from './commands';
import type { CommandSection } from '../domain/commandSearch';

export interface CommandListProps {
  readonly id: string;
  readonly sections: readonly CommandSection<Command>[];
  readonly active: number;
  readonly onPoint: (index: number) => void;
  readonly onRun: (command: Command) => void;
}

function Art({ art }: { readonly art: CommandArt | undefined }) {
  if (!art) return null;
  if ('icon' in art) return <PixelIcon name={art.icon} />;
  if ('picture' in art)
    return (
      <img
        className="hud-command-picture"
        src={art.picture}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  return (
    <span className="hud-command-glyph" aria-hidden="true">
      {art.glyph}
    </span>
  );
}

// Empty cells rather than nothing, so the grid keeps a check mark in its own column.
function Marks({ command }: { readonly command: Command }) {
  return (
    <>
      {command.shortcut ? <kbd className="hud-option-key">{command.shortcut}</kbd> : <span />}
      <span className="hud-option-check">
        {command.checked ? <PixelIcon name="check" /> : null}
      </span>
    </>
  );
}

interface ItemProps {
  readonly command: Command;
  readonly id: string;
  readonly active: boolean;
  readonly onPoint: () => void;
  readonly onRun: () => void;
}

// Pointed rather than entered, so a list scrolling under a resting mouse does not steal the cursor.
function Item({ command, id, active, onPoint, onRun }: ItemProps) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div
      ref={row}
      id={id}
      role="option"
      className="hud-command-item"
      aria-selected={active}
      aria-checked={command.checked}
      onPointerMove={onPoint}
      onClick={onRun}
    >
      <span className="hud-option-icon">
        <Art art={command.art} />
      </span>
      <span className="hud-option-text">
        <span className="hud-option-label">{command.label}</span>
        {command.note ? <span className="hud-option-note">{command.note}</span> : null}
      </span>
      <Marks command={command} />
    </div>
  );
}

export function CommandList({ id, sections, active, onPoint, onRun }: CommandListProps) {
  let index = 0;
  return (
    <div id={id} className="hud-command-list" role="listbox">
      {sections.map((section) => (
        <div
          key={section.group}
          className="hud-command-group"
          role="group"
          aria-label={section.group}
        >
          <p className="hud-menu-heading">{section.group}</p>
          {section.items.map((command) => {
            const at = index++;
            return (
              <Item
                key={command.id}
                command={command}
                id={`${id}-${at}`}
                active={at === active}
                onPoint={() => onPoint(at)}
                onRun={() => onRun(command)}
              />
            );
          })}
        </div>
      ))}
      {sections.length === 0 ? <p className="hud-command-empty">Nothing answers to that.</p> : null}
    </div>
  );
}
