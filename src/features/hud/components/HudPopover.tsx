import type { ReactNode } from 'react';

export interface HudPopoverProps {
  /** What the toggle button reads. */
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

/**
 * A labelled button with a panel hanging off it.
 *
 * Every tool the bar holds is one of these, so the bar itself stays a list of
 * names and the panels know nothing about being hidden — which is what lets a
 * tool be added by writing its panel and nothing else.
 */
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
