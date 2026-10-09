import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { GuestView, SelectionView } from '../../inspect/domain/selection';
import { NeedBars, PARTY_KINDS, ThinksRow } from '../../hud/components/GuestRows';
import { StatRow } from '../../../shared/components/StatRow';
import type { FollowView } from '../domain/followRules';
import { keptOnScreen, type Offset, type Rect } from '../domain/cardSpot';
import { swipeOf } from '../domain/followSheet';

export interface FollowSheet {
  readonly collapsed: boolean;
  readonly onCollapse: (collapsed: boolean) => void;
}

export interface FollowCardProps {
  readonly following: FollowView;
  readonly selection: SelectionView | null;
  // Written per frame by the overlay, as the inspector's activity line is.
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onToggleView: () => void;
  readonly onRideAlong: () => void;
  readonly onStop: () => void;
  // Where the player dragged the card to, from where it stands by default; kept across follows.
  readonly offset: Offset;
  readonly onMove: (offset: Offset) => void;
  // On a phone: a bar of its actions that opens into a sheet; null keeps the card to drag about.
  readonly sheet: FollowSheet | null;
}

interface Drag {
  readonly pointer: Offset;
  readonly from: Offset;
  readonly box: Rect;
}

interface Dragging {
  readonly drag: Drag;
  readonly live: Offset | null;
}

// Held here while dragging and handed up on release, as a window's place is.
function useCardDrag(offset: Offset, onMove: (offset: Offset) => void) {
  const [dragging, setDragging] = useState<Dragging | null>(null);

  const grab = (event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX, y: event.clientY };
    setDragging({ drag: { pointer, from: offset, box: { left, top, right, bottom } }, live: null });
  };

  const follow = (event: PointerEvent<HTMLElement>): void => {
    if (!dragging) return;
    const { pointer, from, box } = dragging.drag;
    const wanted = { x: from.x + event.clientX - pointer.x, y: from.y + event.clientY - pointer.y };
    const view = { width: globalThis.innerWidth, height: globalThis.innerHeight };
    setDragging({ ...dragging, live: keptOnScreen(wanted, from, box, view) });
  };

  const drop = (): void => {
    if (dragging?.live) onMove(dragging.live);
    setDragging(null);
  };

  const at = dragging?.live ?? offset;
  const style = { ['--drag-x' as string]: `${at.x}px`, ['--drag-y' as string]: `${at.y}px` };
  return {
    dragging: dragging !== null,
    style: style as CSSProperties,
    handlers: {
      onPointerDown: grab,
      onPointerMove: follow,
      onPointerUp: drop,
      onPointerCancel: drop,
    },
  };
}

// Decided while the finger is still down, and the tap it ends in is swallowed, so a swipe that
// starts or ends on Stop never stops the follow.
function useSheetSwipe(onCollapse: (collapsed: boolean) => void) {
  const start = useRef<Offset | null>(null);
  const swiped = useRef(false);
  const letGo = (): void => {
    start.current = null;
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>): void => {
      swiped.current = false;
      start.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    },
    onPointerMove: (event: PointerEvent<HTMLElement>): void => {
      if (!start.current || swiped.current) return;
      const swipe = swipeOf(event.clientX - start.current.x, event.clientY - start.current.y);
      if (swipe === null) return;
      swiped.current = true;
      onCollapse(swipe === 'shut');
    },
    onPointerUp: letGo,
    onPointerCancel: letGo,
    onClickCapture: (event: MouseEvent<HTMLElement>): void => {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

const guestOf = (following: FollowView, selection: SelectionView | null): GuestView | null =>
  selection?.kind === 'guest' && selection.person === following.guest ? selection : null;

const nameOf = (guest: GuestView): string => (guest.child ? `${guest.name} (child)` : guest.name);

function titleOf(following: FollowView, guest: GuestView | null): string {
  if (!guest) return following.riding ?? 'Following';
  return following.left ? `${guest.name} has checked out` : nameOf(guest);
}

function GuestRows({
  guest,
  following,
  activityElement,
}: {
  readonly guest: GuestView;
  readonly following: FollowView;
  readonly activityElement: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <>
      <p className="ui-activity">
        {following.riding ? (
          `Riding along on a ${following.riding}`
        ) : (
          <span ref={activityElement}>—</span>
        )}
      </p>
      <dl className="ui-stats">
        <StatRow label="Party">{PARTY_KINDS[guest.partyKind]}</StatRow>
        <StatRow label="Mood">{Math.round(guest.happiness * 100)}%</StatRow>
      </dl>
      <NeedBars needs={guest.needs} />
      <ThinksRow thought={guest.thought} />
    </>
  );
}

function ViewButton({
  following,
  onToggleView,
}: Pick<FollowCardProps, 'following' | 'onToggleView'>) {
  if (!following.firstPerson || following.left) return null;
  return (
    <button type="button" className="ui-button-large" onClick={onToggleView}>
      {following.view === 'first' ? 'Third person' : 'First person'}
    </button>
  );
}

function Actions({
  following,
  onToggleView,
  onRideAlong,
  onStop,
}: Pick<FollowCardProps, 'following' | 'onToggleView' | 'onRideAlong' | 'onStop'>) {
  return (
    <div className="ui-actions">
      <ViewButton following={following} onToggleView={onToggleView} />
      {following.rideOffered ? (
        <button type="button" className="ui-button-large" onClick={onRideAlong}>
          Ride along
        </button>
      ) : null}
      <button type="button" className="ui-button-large" onClick={onStop}>
        <span aria-hidden="true">✕</span> Stop
      </button>
    </div>
  );
}

const flag = (on: boolean): '' | undefined => (on ? '' : undefined);

type Shown = Omit<FollowCardProps, 'offset' | 'onMove' | 'sheet'>;

function Details({ selection, activityElement, following }: Shown) {
  const guest = guestOf(following, selection);
  if (!guest || following.left) return null;
  return <GuestRows guest={guest} following={following} activityElement={activityElement} />;
}

// Sits where the touch placement bar does, until dragged elsewhere; the two never show together,
// as arming a tool ends a follow.
function FloatingCard({ offset, onMove, ...shown }: Omit<FollowCardProps, 'sheet'>) {
  const { following, selection } = shown;
  const drag = useCardDrag(offset, onMove);
  return (
    <section
      className="guest-view-follow ui-plate"
      aria-label="Following"
      data-dragging={flag(drag.dragging)}
      style={drag.style}
      {...drag.handlers}
    >
      <p className="guest-view-follow-name" aria-live="polite">
        {titleOf(following, guestOf(following, selection))}
      </p>
      <Details {...shown} />
      <Actions {...shown} />
    </section>
  );
}

// The title is a button, as a window sheet's is, so a keyboard opens it as a tap or a swipe does.
function SheetCard({ sheet, ...shown }: Shown & { readonly sheet: FollowSheet }) {
  const { following, selection } = shown;
  const { collapsed } = sheet;
  const swipe = useSheetSwipe(sheet.onCollapse);
  return (
    <section
      className="guest-view-follow ui-plate"
      aria-label="Following"
      data-sheet=""
      data-collapsed={flag(collapsed)}
      {...swipe}
    >
      <button
        type="button"
        className="ui-window-toggle guest-view-follow-toggle"
        aria-expanded={!collapsed}
        onClick={() => sheet.onCollapse(!collapsed)}
      >
        <span className="ui-window-grip" aria-hidden="true" />
        <span className="guest-view-follow-name" aria-live="polite">
          {titleOf(following, guestOf(following, selection))}
        </span>
      </button>
      {collapsed ? null : <Details {...shown} />}
      <Actions {...shown} />
    </section>
  );
}

export function FollowCard({ sheet, offset, onMove, ...shown }: FollowCardProps) {
  if (sheet) return <SheetCard sheet={sheet} {...shown} />;
  return <FloatingCard offset={offset} onMove={onMove} {...shown} />;
}
