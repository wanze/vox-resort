import { useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import type { GuestView, SelectionView } from '../../inspect/domain/selection';
import { NeedBars, PARTY_KINDS, ThinksRow } from '../../hud/components/GuestRows';
import { StatRow } from '../../hud/components/StatRow';
import type { FollowView } from '../domain/followRules';
import { keptOnScreen, type Offset, type Rect } from '../domain/cardSpot';

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
      <p className="hud-inspect-activity">
        {following.riding ? (
          `Riding along on a ${following.riding}`
        ) : (
          <span ref={activityElement}>—</span>
        )}
      </p>
      <dl className="hud-stats">
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
    <button type="button" className="hud-placement-button" onClick={onToggleView}>
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
    <div className="hud-follow-actions">
      <ViewButton following={following} onToggleView={onToggleView} />
      {following.rideOffered ? (
        <button type="button" className="hud-placement-button" onClick={onRideAlong}>
          Ride along
        </button>
      ) : null}
      <button type="button" className="hud-placement-button" onClick={onStop}>
        <span aria-hidden="true">✕</span> Stop
      </button>
    </div>
  );
}

// Sits where the touch placement bar does, until dragged elsewhere; the two never show together,
// as arming a tool ends a follow.
export function FollowCard({
  selection,
  activityElement,
  offset,
  onMove,
  ...actions
}: FollowCardProps) {
  const { following } = actions;
  const guest = guestOf(following, selection);
  const drag = useCardDrag(offset, onMove);
  return (
    <section
      className="hud-follow hud-plate"
      aria-label="Following"
      data-dragging={drag.dragging ? '' : undefined}
      style={drag.style}
      {...drag.handlers}
    >
      <p className="hud-follow-name" aria-live="polite">
        {titleOf(following, guest)}
      </p>
      {guest && !following.left ? (
        <GuestRows guest={guest} following={following} activityElement={activityElement} />
      ) : null}
      <Actions {...actions} />
    </section>
  );
}
