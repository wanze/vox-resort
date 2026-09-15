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

/**
 * The five needs' display names. Four lines duplicated from `selection.ts`
 * rather than exported from it: that one is the wording a *venue* serves, and a
 * shared map would tie the panel's labels to the inspector's domain wording for
 * nothing but the saving of four strings.
 */
const NEED_LABELS: { readonly [need in GuestView['needs'][number]['need']]: string } = {
  hunger: 'Hunger',
  thirst: 'Thirst',
  energy: 'Energy',
  fun: 'Fun',
  hygiene: 'Hygiene',
};

/** The mood a need is felt as, for the `Wants` row's note. */
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

/**
 * How well each need is met, as five bars.
 *
 * The number goes in the bar's `aria-label` as well as in its width, so the
 * readout says something without colour and to a screen reader - a bar that is
 * only a length is a picture of a number nobody can read.
 */
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

/** Where they would go next, and what sends them: nothing at all when content. */
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
      <StatRow label="Inside" note="of what it holds">
        {venue.inside} / {venue.capacity}
      </StatRow>
      <StatRow label="Waiting" note="in the line at the door">
        {venue.waiting === 0 ? 'Nobody' : venue.waiting}
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
