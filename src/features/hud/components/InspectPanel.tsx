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
  // Written per frame by the overlay, so the panel never re-renders as the resort ticks.
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  readonly onClose: () => void;
}

const PARTY_KINDS: { readonly [kind in GuestView['partyKind']]: string } = {
  family: 'Family',
  couple: 'Couple',
  friends: 'Friends',
  solo: 'On their own',
};

// Duplicated from selection.ts on purpose: that wording is what a venue serves.
const NEED_LABELS: { readonly [need in GuestView['needs'][number]['need']]: string } = {
  hunger: 'Hunger',
  thirst: 'Thirst',
  energy: 'Energy',
  fun: 'Fun',
  hygiene: 'Hygiene',
};

const NEED_MOODS: { readonly [need in GuestView['needs'][number]['need']]: string } = {
  hunger: 'hungry',
  thirst: 'thirsty',
  energy: 'tired',
  fun: 'bored',
  hygiene: 'grubby',
};

const ROLES: { readonly [role in NonNullable<PlaceView['venue']>['role']]: string } = {
  lodging: 'Lodging',
  food: 'Food',
  drink: 'Drinks',
  activity: 'Activity',
  service: 'Service',
};

const nightsOf = (count: number): string => `${count} ${count === 1 ? 'night' : 'nights'}`;

function stayLine({ nights, nightsLeft }: GuestView): string {
  if (nightsLeft < 0) return `${nightsOf(nights)}, ${nightsOf(-nightsLeft)} overdue`;
  return `${nightsLeft} of ${nightsOf(nights)} left`;
}

interface MemberListProps {
  readonly label: string;
  readonly members: readonly PartyMemberView[];
  readonly selected: number | null;
  readonly onSelectPerson: (person: number) => void;
}

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

function NeedBars({ needs }: { readonly needs: GuestView['needs'] }) {
  return (
    <div className="hud-needs" role="group" aria-label="How they are doing">
      {needs.map(({ need, level }) => (
        <div key={need} className="hud-need">
          <span className="hud-need-label">{NEED_LABELS[need]}</span>
          <span
            className="hud-need-track"
            aria-label={`${NEED_LABELS[need]} ${Math.round(level * 100)}%`}
          >
            <span className="hud-need-fill" style={{ width: `${level * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function WantsRow({ wants }: { readonly wants: GuestView['wants'] }) {
  if (!wants) return <StatRow label="Wants">Nothing right now</StatRow>;
  return (
    <StatRow label="Wants" note={NEED_MOODS[wants.need]}>
      {wants.label}
    </StatRow>
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
        <StatRow label="Mood" note="how good a time they are having">
          {Math.round(guest.happiness * 100)}%
        </StatRow>
        <WantsRow wants={guest.wants} />
      </dl>
      <NeedBars needs={guest.needs} />
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

function SurroundingsRow({ setting }: { readonly setting: number }) {
  return (
    <StatRow label="Surroundings" note="how pleasant it is around it">
      {Math.round(setting * 100)}%
    </StatRow>
  );
}

function VenueRows({ venue, setting }: { readonly venue: Venue; readonly setting: number }) {
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
      <StatRow label="Inside" note="of what it holds">
        {venue.inside} / {venue.capacity}
      </StatRow>
      <StatRow label="Waiting" note="in the line at the door">
        {venue.waiting === 0 ? 'Nobody' : venue.waiting}
      </StatRow>
      <StatRow label="Cleanliness" note="a dirty place is chosen less">
        {Math.round(venue.cleanliness * 100)}%
      </StatRow>
      <SurroundingsRow setting={setting} />
    </dl>
  );
}

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
    return (
      <>
        <p className="hud-loading">Dressing: nothing here for a guest to do.</p>
        <dl className="hud-stats">
          <SurroundingsRow setting={place.setting} />
        </dl>
      </>
    );
  }
  return (
    <>
      <VenueRows venue={place.venue} setting={place.setting} />
      <Residents place={place} onSelectPerson={onSelectPerson} />
    </>
  );
}

function titleOf(selection: SelectionView): string {
  if (selection.kind === 'place') {
    return `${selection.label}, tile ${selection.tile.x}, ${selection.tile.z}`;
  }
  return selection.child ? `${selection.name} (child)` : selection.name;
}

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
