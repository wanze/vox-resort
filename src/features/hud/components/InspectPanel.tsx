import type { RefObject } from 'react';
import type {
  GuestView,
  PartyMemberView,
  PlaceView,
  SelectionView,
} from '../../inspect/domain/selection';
import { StatRow } from './StatRow';

export interface InspectPanelProps {
  readonly selection: SelectionView | null;
  /** The live line, written per frame; see `hudOverlay.ts`. */
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  /** Selects somebody else - a member of the same party, from the list. */
  readonly onSelectPerson: (person: number) => void;
  readonly onClose: () => void;
}

const PARTY_KINDS: { readonly [kind in GuestView['partyKind']]: string } = {
  family: 'Family',
  couple: 'Couple',
  friends: 'Friends',
  solo: 'On their own',
};

const ROLES: { readonly [role in NonNullable<PlaceView['venue']>['role']]: string } = {
  lodging: 'Lodging',
  food: 'Food',
  drink: 'Drinks',
  activity: 'Activity',
  service: 'Service',
};

const nightsOf = (count: number): string => `${count} ${count === 1 ? 'night' : 'nights'}`;

/** How far through their stay a guest is, or how far past it. */
function stayLine({ nights, nightsLeft }: GuestView): string {
  if (nightsLeft < 0) return `${nightsOf(nights)}, ${nightsOf(-nightsLeft)} overdue`;
  return `${nightsLeft} of ${nightsOf(nights)} left`;
}

interface MemberListProps {
  readonly label: string;
  readonly members: readonly PartyMemberView[];
  /** Who is on screen now, if they are in the list. */
  readonly selected: number | null;
  readonly onSelectPerson: (person: number) => void;
}

/** People as buttons, so a family can be walked through one member at a time. */
function MemberList({ label, members, selected, onSelectPerson }: MemberListProps) {
  return (
    <div className="hud-inspect-members" role="group" aria-label={label}>
      {members.map((member) => (
        <button
          key={member.person}
          type="button"
          className="hud-camera-mode"
          aria-pressed={member.person === selected}
          onClick={() => onSelectPerson(member.person)}
        >
          {member.name}
          {member.child ? ' (child)' : ''}
        </button>
      ))}
    </div>
  );
}

function GuestDetails({
  guest,
  activityElement,
  onSelectPerson,
}: {
  readonly guest: GuestView;
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
}) {
  return (
    <>
      <p className="hud-inspect-activity">
        <span ref={activityElement}>—</span>
      </p>
      <dl className="hud-stats">
        <StatRow label="Party" note={guest.family}>
          {PARTY_KINDS[guest.partyKind]}
        </StatRow>
        <StatRow label="Sleeps" note={guest.home?.key}>
          {guest.home ? guest.home.label : 'No bed on the plot'}
        </StatRow>
        <StatRow label="Stay">{stayLine(guest)}</StatRow>
      </dl>
      <MemberList
        label="Their party"
        members={guest.members}
        selected={guest.person}
        onSelectPerson={onSelectPerson}
      />
    </>
  );
}

type Venue = NonNullable<PlaceView['venue']>;

/** What a venue is and what it does, as rows. */
function VenueRows({ venue }: { readonly venue: Venue }) {
  return (
    <dl className="hud-stats">
      <StatRow label="Role">{ROLES[venue.role]}</StatRow>
      <StatRow label="Capacity">{venue.capacity}</StatRow>
      {venue.role === 'lodging' ? (
        <StatRow label="Beds">{venue.beds}</StatRow>
      ) : (
        <StatRow label="Serves">{venue.serves.join(', ') || '—'}</StatRow>
      )}
      <StatRow label="Typical stay">{venue.dwell}</StatRow>
      {/* Nobody is inside anything until venues have queues; a zero here would
          be a number that means nothing. */}
      <StatRow label="Occupancy" note="arrives with queues">
        not tracked yet
      </StatRow>
    </dl>
  );
}

/** Who sleeps under a lodging's roof; nothing at all for anything else. */
function Residents({
  place,
  onSelectPerson,
}: {
  readonly place: PlaceView;
  readonly onSelectPerson: (person: number) => void;
}) {
  if (place.venue?.role !== 'lodging') return null;
  if (place.residents.length === 0) return <p className="hud-loading">Nobody sleeps here.</p>;
  return (
    <MemberList
      label="Who sleeps here"
      members={place.residents}
      selected={null}
      onSelectPerson={onSelectPerson}
    />
  );
}

function PlaceDetails({
  place,
  onSelectPerson,
}: {
  readonly place: PlaceView;
  readonly onSelectPerson: (person: number) => void;
}) {
  if (!place.venue) {
    return <p className="hud-loading">Dressing: nothing here for a guest to do.</p>;
  }
  return (
    <>
      <VenueRows venue={place.venue} />
      <Residents place={place} onSelectPerson={onSelectPerson} />
    </>
  );
}

/** The panel's heading: who somebody is, or what stands where. */
function titleOf(selection: SelectionView): string {
  if (selection.kind === 'place') {
    return `${selection.label}, tile ${selection.tile.x}, ${selection.tile.z}`;
  }
  return selection.child ? `${selection.name} (child)` : selection.name;
}

/**
 * Who or what was clicked on.
 *
 * Presentational only: the facts arrive as `selection`, set once per click, and
 * the one line that changes per frame is a node the overlay writes into. So the
 * panel re-renders when the selection changes and never when the resort ticks.
 */
export function InspectPanel({
  selection,
  activityElement,
  onSelectPerson,
  onClose,
}: InspectPanelProps) {
  if (!selection) return null;

  return (
    <section className="hud-inspect" aria-label="Inspector">
      <div className="hud-inspect-head">
        <h2 className="hud-inspect-title">{titleOf(selection)}</h2>
        <button
          type="button"
          className="hud-camera-mode hud-inspect-close"
          aria-label="Close the inspector"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {selection.kind === 'guest' ? (
        <GuestDetails
          guest={selection}
          activityElement={activityElement}
          onSelectPerson={onSelectPerson}
        />
      ) : (
        <PlaceDetails place={selection} onSelectPerson={onSelectPerson} />
      )}
    </section>
  );
}
