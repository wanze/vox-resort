import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { clampSpot, type Box, type WindowId, type WindowSpot } from '../domain/windowLayout';

export interface HudWindowFrame {
  readonly id: WindowId;
  // A sheet docked to an edge on a small screen: it neither floats nor drags.
  readonly compact: boolean;
  // Shrunk to its tools while one is armed, so the map stays in view to build on.
  readonly peek: boolean;
  readonly spot: WindowSpot | null;
  readonly depth: number;
  readonly onRaise: () => void;
  readonly onMove: (spot: WindowSpot) => void;
  readonly onClose: () => void;
}

export interface HudWindowProps {
  readonly frame: HudWindowFrame;
  readonly title: string;
  readonly icon: IconName;
  readonly children: ReactNode;
}

interface Drag {
  readonly grip: WindowSpot;
  readonly origin: WindowSpot;
  readonly size: Box;
  readonly viewport: Box;
  readonly top: number;
}

// Windows stack above the resort and below the top bar, whose menus must cover them.
const BASE_DEPTH = 10;

function styleOf(frame: HudWindowFrame, live: WindowSpot | null): CSSProperties {
  const zIndex = BASE_DEPTH + frame.depth;
  const spot = live ?? frame.spot;
  if (!spot || frame.compact) return { zIndex };
  // min() so a window keeps its grip on screen when the browser is made smaller than it was.
  return {
    zIndex,
    left: `min(${spot.x}px, calc(100% - 96px))`,
    top: `min(${spot.y}px, calc(100% - 44px))`,
    right: 'auto',
    bottom: 'auto',
    ['--window-top' as string]: `${spot.y}px`,
  };
}

function panelOf(event: PointerEvent<HTMLElement>): { panel: HTMLElement; host: Element } | null {
  const panel = event.currentTarget.closest('.hud-window');
  if (!(panel instanceof HTMLElement) || !panel.offsetParent) return null;
  return { panel, host: panel.offsetParent };
}

function dragFrom(event: PointerEvent<HTMLElement>): Drag | null {
  const found = panelOf(event);
  if (!found) return null;
  const { panel, host } = found;
  const box = panel.getBoundingClientRect();
  const room = host.getBoundingClientRect();
  const top = Number.parseFloat(getComputedStyle(panel).getPropertyValue('--window-floor')) || 0;
  return {
    grip: { x: event.clientX - box.left, y: event.clientY - box.top },
    origin: { x: room.left, y: room.top },
    size: { width: box.width, height: box.height },
    viewport: { width: room.width, height: room.height },
    top,
  };
}

// The dragged position is held here and only handed up on release, so the rest of the HUD
// does not re-render with every pointer move.
function useWindowDrag({ compact, onMove }: HudWindowFrame) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<WindowSpot | null>(null);

  const grab = (event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    const started = dragFrom(event);
    if (!started) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(started);
  };

  const follow = (event: PointerEvent<HTMLElement>): void => {
    if (!drag) return;
    const wanted = {
      x: event.clientX - drag.origin.x - drag.grip.x,
      y: event.clientY - drag.origin.y - drag.grip.y,
    };
    setLive(clampSpot(wanted, drag.size, drag.viewport, drag.top));
  };

  const drop = (): void => {
    if (live) onMove(live);
    setDrag(null);
    setLive(null);
  };

  const handlers = {
    onPointerDown: grab,
    onPointerMove: follow,
    onPointerUp: drop,
    onPointerCancel: drop,
  };
  return { dragging: drag !== null, live, handlers: compact ? {} : handlers };
}

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

const stateOf = (dragging: boolean, sheet: Sheet | null, peek: boolean) => ({
  'data-dragging': flag(dragging),
  'data-expanded': flag(sheet?.expanded === true),
  'data-peek': flag(peek),
});

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
        <h2 className="hud-window-title">{title}</h2>
      </>
    );
  }
  return (
    <button
      type="button"
      className="hud-window-toggle"
      aria-expanded={sheet.expanded}
      onClick={sheet.toggle}
    >
      <span className="hud-window-grip" aria-hidden="true" />
      <PixelIcon name={icon} />
      <span className="hud-window-title">{title}</span>
    </button>
  );
}

export function HudWindow({ frame, title, icon, children }: HudWindowProps) {
  const drag = useWindowDrag(frame);
  const sheet = useSheet(frame);

  return (
    <section
      className="hud-window"
      data-window={frame.id}
      {...stateOf(drag.dragging, sheet, frame.peek)}
      aria-label={title}
      style={styleOf(frame, drag.live)}
      onPointerDownCapture={frame.onRaise}
    >
      <header className="hud-window-head" {...drag.handlers}>
        <WindowTitle title={title} icon={icon} sheet={sheet} />
        <button
          type="button"
          className="hud-window-close"
          aria-label={`Close ${title}`}
          title="Close"
          onClick={frame.onClose}
        >
          <PixelIcon name="close" scale={1} />
        </button>
      </header>
      <div className="hud-window-body">{children}</div>
    </section>
  );
}
