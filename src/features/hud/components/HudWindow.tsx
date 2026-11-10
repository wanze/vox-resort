import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionSlot } from '../../../shared/components/Actions';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { useReturnFocus } from '../../../shared/components/useReturnFocus';
import type { IconName } from '../../../shared/components/pixelIcons';
import type { WindowId } from '../domain/windowLayout';

export interface HudWindowFrame {
  readonly id: WindowId;
  // A sheet docked to an edge of a small screen rather than a window in a column.
  readonly compact: boolean;
  // Shrunk to its tools while one is armed, so the map stays in view to build on.
  readonly peek: boolean;
  readonly depth: number;
  // Opened by the player just now, so the keyboard follows it in.
  readonly takesFocus: boolean;
  // Back to the window this one took the place of, with that window's title.
  readonly back: { readonly title: string; readonly onBack: () => void } | null;
  readonly onRaise: () => void;
  readonly onClose: () => void;
}

export interface HudWindowProps {
  readonly frame: HudWindowFrame;
  readonly title: string;
  readonly icon: IconName;
  readonly children: ReactNode;
}

// Windows stack above the resort and below the top bar, whose menus must cover them.
const BASE_DEPTH = 10;

// Disarming a tool brings the sheet back to half height, however far it was pulled up.
function useSheet({ compact, peek }: HudWindowFrame): Sheet | null {
  const [expanded, setExpanded] = useState(false);
  const [peeked, setPeeked] = useState(peek);
  if (peek !== peeked) {
    setPeeked(peek);
    if (!peek) setExpanded(false);
  }
  return compact ? { expanded, toggle: () => setExpanded(!expanded) } : null;
}

interface Sheet {
  readonly expanded: boolean;
  readonly toggle: () => void;
}

const flag = (on: boolean): '' | undefined => (on ? '' : undefined);

const stateOf = (sheet: Sheet | null, peek: boolean) => ({
  'data-expanded': flag(sheet?.expanded === true),
  'data-peek': flag(peek),
});

function BackButton({ title, onBack }: NonNullable<HudWindowFrame['back']>) {
  return (
    <button
      type="button"
      className="ui-window-back"
      aria-label={`Back to ${title}`}
      title={`Back to ${title}`}
      onClick={onBack}
    >
      <PixelIcon name="back" scale={1} />
    </button>
  );
}

interface WindowTitleProps {
  readonly title: string;
  readonly icon: IconName;
  readonly sheet: Sheet | null;
}

// A sheet's title is a button, so a keyboard or a screen reader can pull it up as a tap does.
function WindowTitle({ title, icon, sheet }: WindowTitleProps) {
  if (!sheet) {
    return (
      <>
        <PixelIcon name={icon} />
        <h2 className="ui-window-title" tabIndex={-1} data-window-focus="">
          {title}
        </h2>
      </>
    );
  }
  return (
    <button
      type="button"
      className="ui-window-toggle"
      data-window-focus=""
      aria-expanded={sheet.expanded}
      onClick={sheet.toggle}
    >
      <span className="ui-window-grip" aria-hidden="true" />
      <PixelIcon name={icon} />
      <span className="ui-window-title">{title}</span>
    </button>
  );
}

const titleOf = (host: Element): HTMLElement | null =>
  host.querySelector<HTMLElement>('[data-window-focus]');

// Hands the keys back to the game without dropping the focus out of the window, so the next
// Escape still closes it rather than opening the main menu.
export function leaveField(field: HTMLElement): void {
  const host = field.closest('.ui-window');
  const title = host ? titleOf(host) : null;
  if (title) title.focus();
  else field.blur();
}

// Only some windows sit on the dock; the main menu opens the rest.
const returnTarget = (id: WindowId): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-dock="${id}"]`) ??
  document.querySelector<HTMLElement>('.hud-menu > .ui-chip');

// Only on mount: a window already open does not pull the keyboard back on a later render.
function useFocusOnOpen(frame: HudWindowFrame) {
  const section = useRef<HTMLElement>(null);
  const [takesFocus] = useState(frame.takesFocus);
  useReturnFocus(() => returnTarget(frame.id));
  useEffect(() => {
    const host = section.current;
    if (!takesFocus || !host || host.contains(document.activeElement)) return;
    titleOf(host)?.focus();
  }, [takesFocus]);
  return section;
}

export function HudWindow({ frame, title, icon, children }: HudWindowProps) {
  const sheet = useSheet(frame);
  const section = useFocusOnOpen(frame);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);

  return (
    <section
      ref={section}
      className="ui-window"
      data-window={frame.id}
      {...stateOf(sheet, frame.peek)}
      aria-label={title}
      style={{ zIndex: BASE_DEPTH + frame.depth }}
      onPointerDownCapture={frame.onRaise}
    >
      <header className="ui-window-head">
        {frame.back ? <BackButton {...frame.back} /> : null}
        <WindowTitle title={title} icon={icon} sheet={sheet} />
        <button
          type="button"
          className="ui-window-close"
          aria-label={`Close ${title}`}
          title="Close"
          onClick={frame.onClose}
        >
          <PixelIcon name="close" scale={1} />
        </button>
      </header>
      <ActionSlot value={actions}>
        <div className="ui-window-body">{children}</div>
      </ActionSlot>
      <div ref={setActions} className="ui-window-actions" />
    </section>
  );
}
