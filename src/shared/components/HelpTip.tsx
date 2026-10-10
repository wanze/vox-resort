import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';

export interface HelpTipProps {
  readonly label: string;
  readonly children: ReactNode;
}

// Long enough that a pointer crossing the panel does not flash the card on its way past.
const HOVER_DELAY_MS = 150;

// A mouse reads it by pointing; a finger or a key presses the button, which the browser toggles,
// and a tap anywhere else closes it again.
export function HelpTip({ label, children }: HelpTipProps) {
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pointer = useRef('');
  const id = useId();
  const anchor = `--ui-help-${id.replace(/[^\w-]/g, '')}`;
  useEffect(() => () => clearTimeout(timer.current), []);

  const isOpen = (): boolean => card.current?.matches(':popover-open') ?? false;
  const showSoon = (): void => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!isOpen()) card.current?.showPopover();
    }, HOVER_DELAY_MS);
  };
  const hide = (): void => {
    clearTimeout(timer.current);
    if (isOpen()) card.current?.hidePopover();
  };

  return (
    <span className="ui-help" style={{ '--ui-help-anchor': anchor } as CSSProperties}>
      <button
        type="button"
        className="ui-help-button"
        aria-label={label}
        popoverTarget={id}
        onPointerDown={(event) => (pointer.current = event.pointerType)}
        onPointerEnter={(event) => event.pointerType === 'mouse' && showSoon()}
        onPointerLeave={(event) => event.pointerType === 'mouse' && hide()}
        // A click would toggle off the card the pointer has just opened.
        onClick={(event) => pointer.current === 'mouse' && event.preventDefault()}
        onKeyDown={(event) => {
          pointer.current = '';
          // The browser closes the card; the game would close the window as well.
          if (event.key === 'Escape' && isOpen()) event.stopPropagation();
        }}
      >
        <PixelIcon name="help" scale={1} />
      </button>
      <div ref={card} id={id} popover="auto" className="ui-panel ui-help-card">
        {children}
      </div>
    </span>
  );
}
