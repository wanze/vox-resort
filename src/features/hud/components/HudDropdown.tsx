import {
  useEffect,
  useId,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { PixelIcon } from './PixelIcon';
import { OptionHost } from './optionHost';
import { useReturnFocus } from './useReturnFocus';
import { rovingTarget } from '../domain/roving';

export interface HudDropdownProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: ReactNode;
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}

type DropdownKind = 'menu' | 'dialog';

const ITEMS = '[role^="menuitem"]:not(:disabled), input:not(:disabled)';

// The stylesheet hides some of the main menu's rows by width, and those are skipped.
const itemsOf = (panel: HTMLElement): HTMLElement[] =>
  [...panel.querySelectorAll<HTMLElement>(ITEMS)].filter((el) => el.getClientRects().length > 0);

const CARET_KEYS: ReadonlySet<string> = new Set(['Home', 'End']);

// A field keeps Home and End for its caret; a slider keeps Left and Right, which a menu ignores.
const keptByField = ({ key, target }: KeyboardEvent<HTMLDivElement>): boolean =>
  target instanceof HTMLInputElement && CARET_KEYS.has(key);

function stepMenu(event: KeyboardEvent<HTMLDivElement>): void {
  if (keptByField(event)) return;
  const items = itemsOf(event.currentTarget);
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = rovingTarget(event.key, at, items.length, 'vertical');
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  items[next]?.focus();
}

// Stopped here, or the game's Escape would find no dropdown open and bring up the main menu.
function escapePopover(event: KeyboardEvent<HTMLDivElement>, close: () => void): void {
  if (event.key !== 'Escape') return;
  const { target } = event;
  // A search field with text in it clears itself first.
  if (target instanceof HTMLInputElement && target.value !== '') return;
  event.preventDefault();
  event.stopPropagation();
  close();
}

interface PanelProps {
  readonly kind: DropdownKind;
  readonly id: string;
  readonly name: string | undefined;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

// Mounted only while open, so its effects run as it opens and closes.
function Panel({ kind, id, name, trigger, onClose, children }: PanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  useReturnFocus(() => trigger.current);
  useEffect(() => {
    const host = panel.current;
    // The Highlight search focuses itself, and keeps it.
    if (!host || host.contains(document.activeElement)) return;
    const first = kind === 'menu' ? itemsOf(host)[0] : host;
    first?.focus();
  }, [kind]);

  // No related target means the focused row went away, as a menu page turns; that is no leaving.
  const leave = (event: FocusEvent<HTMLDivElement>): void => {
    const to = event.relatedTarget;
    if (to instanceof Node && !event.currentTarget.contains(to)) onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (kind === 'menu') stepMenu(event);
    else escapePopover(event, onClose);
  };

  return (
    <div
      ref={panel}
      id={id}
      className="hud-dropdown-panel"
      role={kind}
      aria-label={name}
      tabIndex={-1}
      onBlur={leave}
      onKeyDown={onKeyDown}
    >
      <OptionHost value={kind === 'menu' ? 'menu' : 'plain'}>{children}</OptionHost>
    </div>
  );
}

interface DropdownProps extends HudDropdownProps {
  readonly kind: DropdownKind;
  readonly name?: string;
}

interface TriggerProps extends Pick<HudDropdownProps, 'open' | 'onOpenChange' | 'label' | 'title'> {
  readonly kind: DropdownKind;
  readonly panelId: string;
}

// The panel keeps the focus through a click on the open chip, or its blur would close it and
// the click open it again.
const keepFocus = (event: MouseEvent): void => event.preventDefault();

const Trigger = ({
  kind,
  panelId,
  open,
  onOpenChange,
  label,
  title,
  ref,
}: TriggerProps & { readonly ref: RefObject<HTMLButtonElement | null> }) => (
  <button
    ref={ref}
    type="button"
    className="hud-chip"
    aria-expanded={open}
    aria-haspopup={kind}
    aria-controls={open ? panelId : undefined}
    aria-label={title}
    title={title}
    onMouseDown={open ? keepFocus : undefined}
    onClick={() => onOpenChange(!open)}
  >
    {label}
    <span className="hud-chip-caret">
      <PixelIcon name="caret" scale={1} />
    </span>
  </button>
);

// The scrim takes the click that closes it, as a game menu does, so it never lands on the resort.
function Dropdown({ kind, name, className, children, ...trigger }: DropdownProps) {
  const chip = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = (): void => trigger.onOpenChange(false);
  return (
    <div className={className ? `hud-dropdown ${className}` : 'hud-dropdown'}>
      <Trigger {...trigger} kind={kind} panelId={panelId} ref={chip} />
      {trigger.open ? (
        <>
          <div className="hud-scrim" onPointerDown={close} />
          <Panel kind={kind} id={panelId} name={name} trigger={chip} onClose={close}>
            {children}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

// Only for rows of HudOption and MenuPage; anything with text, lists or fields is a popover.
export function HudMenu(props: HudDropdownProps) {
  return <Dropdown {...props} kind="menu" />;
}

export function HudPopover(props: HudDropdownProps & { readonly name: string }) {
  return <Dropdown {...props} kind="dialog" />;
}
