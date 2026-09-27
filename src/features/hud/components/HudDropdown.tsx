import type { ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';

export interface HudDropdownProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: ReactNode;
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}

// The scrim takes the click that closes it, as a game menu does, so it never lands on the resort.
export function HudDropdown({
  open,
  onOpenChange,
  label,
  title,
  className,
  children,
}: HudDropdownProps) {
  return (
    <div className={className ? `hud-dropdown ${className}` : 'hud-dropdown'}>
      <button
        type="button"
        className="hud-chip"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={title}
        title={title}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <span className="hud-chip-caret">
          <PixelIcon name="caret" scale={1} />
        </span>
      </button>
      {open ? (
        <>
          <div className="hud-scrim" onPointerDown={() => onOpenChange(false)} />
          <div className="hud-dropdown-panel" role="menu">
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
