import type { ReactNode } from 'react';

export interface HudPopoverProps {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

export function HudPopover({ label, open, onToggle, children }: HudPopoverProps) {
  return (
    <div className="hud-popover">
      <button type="button" className="hud-popover-toggle" aria-expanded={open} onClick={onToggle}>
        {label}
      </button>
      {open ? <div className="hud-popover-panel">{children}</div> : null}
    </div>
  );
}
