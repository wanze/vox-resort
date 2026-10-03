import type { ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';

export interface HudOptionProps {
  readonly label: string;
  readonly onSelect: () => void;
  readonly icon?: IconName | null;
  readonly note?: ReactNode;
  readonly shortcut?: string | undefined;
  // A radio row when it is set, a plain command when it is not; a checkbox row when many can be.
  readonly checked?: boolean;
  readonly many?: boolean;
  readonly disabled?: boolean;
  // Opens a page of the menu instead of doing something.
  readonly more?: boolean;
}

function roleOf(checked: boolean | undefined, many: boolean): string {
  if (checked === undefined) return 'menuitem';
  return many ? 'menuitemcheckbox' : 'menuitemradio';
}

export function HudOption({
  label,
  onSelect,
  icon = null,
  note,
  shortcut,
  checked,
  many = false,
  disabled = false,
  more = false,
}: HudOptionProps) {
  return (
    <button
      type="button"
      className="hud-option"
      role={roleOf(checked, many)}
      aria-checked={checked}
      aria-haspopup={more ? 'menu' : undefined}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="hud-option-icon">{icon ? <PixelIcon name={icon} /> : null}</span>
      <span className="hud-option-text">
        <span className="hud-option-label">{label}</span>
        {note ? <span className="hud-option-note">{note}</span> : null}
      </span>
      <OptionMarks shortcut={shortcut} checked={checked === true} more={more} />
    </button>
  );
}

function OptionMarks({
  shortcut,
  checked,
  more,
}: {
  readonly shortcut: string | undefined;
  readonly checked: boolean;
  readonly more: boolean;
}) {
  return (
    <>
      {shortcut ? <kbd className="hud-option-key">{shortcut}</kbd> : null}
      {more ? (
        <span className="hud-option-more" aria-hidden="true">
          ›
        </span>
      ) : null}
      {checked ? (
        <span className="hud-option-check">
          <PixelIcon name="check" />
        </span>
      ) : null}
    </>
  );
}
