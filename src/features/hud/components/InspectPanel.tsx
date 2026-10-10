import type { RefObject } from 'react';
import type {
  GuestView,
  LifeguardWatch,
  PartyMemberView,
  PlaceView,
  SelectionView,
  SendOffers,
  SendState,
  StaffView,
} from '../../inspect/domain/selection';
import type { OrderRole } from '../../sim/domain/staffRouter';
import type { Advice } from '../../sim/domain/advice';
import { adviceAt } from '../domain/markers';
import { adviceKey, severityOf } from '../domain/news';
import { adviceIcon, adviceSays } from './adviceWords';
import { HireButton, type HireControls } from './HireButton';
import { HudWindow, type HudWindowFrame } from './HudWindow';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { StatRow } from '../../../shared/components/StatRow';
import { EXPECTATION_WORDS, NeedBars, PARTY_KINDS, ThinksRow } from './GuestRows';
import { VenueActions, VenueKind } from './VenueName';

export interface InspectPanelProps {
  readonly frame: HudWindowFrame;
  readonly selection: SelectionView | null;
  readonly advice: readonly Advice[];
  // Written per frame by the overlay, so the panel never re-renders as the resort ticks.
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  // Looks at the inspected worker where they are now: staff walk off while the panel is open.
  readonly onShow: () => void;
  // Takes the camera to the inspected guest's shoulder.
  readonly onFollow: () => void;
  readonly onSend: (role: OrderRole) => void;
  readonly hire?: HireControls;
  readonly onRenameVenue: (key: string, name: string) => void;
  readonly onOpenProgramme: (key: string) => void;
}

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
          className="ui-button"
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

function WantsRow({ wants }: { readonly wants: GuestView['wants'] }) {
  if (!wants) return <StatRow label="Wants">Nothing right now</StatRow>;
  return <StatRow label="Wants">{wants.label}</StatRow>;
}

function GuestDetails({
  guest,
  activityElement,
  onSelectPerson,
  onFollow,
}: {
  readonly guest: GuestView;
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  readonly onFollow: () => void;
}) {
  return (
    <>
      <p className="ui-activity">
        <span ref={activityElement}>—</span>
      </p>
      <dl className="ui-stats">
        <StatRow label="Party">{PARTY_KINDS[guest.partyKind]}</StatRow>
        <StatRow label="Sleeps">{guest.home ? guest.home.label : 'No bed on the plot'}</StatRow>
        <StatRow label="Stay">{stayLine(guest)}</StatRow>
        {guest.welcomed ? <StatRow label="Welcome meeting">attended</StatRow> : null}
        <StatRow label="Mood">{Math.round(guest.happiness * 100)}%</StatRow>
        <StatRow label="Expects">{EXPECTATION_WORDS[guest.expects]}</StatRow>
        <WantsRow wants={guest.wants} />
      </dl>
      <NeedBars needs={guest.needs} />
      <ThinksRow thought={guest.thought} />
      <MemberList
        label="Their party"
        members={guest.members}
        selected={guest.person}
        onSelectPerson={onSelectPerson}
      />
      <div className="ui-actions">
        <button type="button" className="ui-button-large" onClick={onFollow}>
          <PixelIcon name="camera" />
          Follow
        </button>
      </div>
    </>
  );
}

type Venue = NonNullable<PlaceView['venue']>;

function SurroundingsRow({ setting }: { readonly setting: number }) {
  return <StatRow label="Surroundings">{Math.round(setting * 100)}%</StatRow>;
}

const LIFEGUARD_WORDS: { readonly [watch in LifeguardWatch]: string } = {
  watching: 'On watch',
  coming: 'On the way',
  nobody: 'Nobody watching',
};

function LifeguardRow({ watch }: { readonly watch: LifeguardWatch | null }) {
  if (watch === null) return null;
  return <StatRow label="Lifeguard">{LIFEGUARD_WORDS[watch]}</StatRow>;
}

function BrokenRow({ broken }: { readonly broken: boolean }) {
  if (!broken) return null;
  return <StatRow label="Repairs">Broken down</StatRow>;
}

function ProgrammeRow({ programme }: { readonly programme: PlaceView['programme'] }) {
  if (!programme) return null;
  return <StatRow label="Programme">{programme.next ?? 'Nothing on this week'}</StatRow>;
}

function PriceStat({ price }: { readonly price: Venue['price'] }) {
  if (!price) return null;
  const list = price.list.toLocaleString('en-US');
  if (price.charged === price.list) return <StatRow label="Price">{list}</StatRow>;
  return (
    <StatRow label="Price">{`${price.charged.toLocaleString('en-US')} (list ${list})`}</StatRow>
  );
}

function VenueRows({ place, venue }: { readonly place: PlaceView; readonly venue: Venue }) {
  return (
    <dl className="ui-stats">
      <StatRow label="Role">{ROLES[venue.role]}</StatRow>
      <ProgrammeRow programme={place.programme} />
      <BrokenRow broken={venue.broken} />
      <StatRow label="Capacity">{venue.capacity}</StatRow>
      {venue.role === 'lodging' ? (
        <StatRow label="Beds">{venue.beds}</StatRow>
      ) : (
        <StatRow label="Serves">{venue.serves.join(', ') || '—'}</StatRow>
      )}
      <StatRow label="Typical stay">{venue.dwell}</StatRow>
      <StatRow label="Inside">
        {venue.inside} / {venue.capacity}
      </StatRow>
      <StatRow label="Waiting">{venue.waiting === 0 ? 'Nobody' : venue.waiting}</StatRow>
      <StatRow label="Cleanliness">{Math.round(venue.cleanliness * 100)}%</StatRow>
      <PriceStat price={venue.price} />
      <StatRow label="Takings today">{venue.takings.toLocaleString('en-US')}</StatRow>
      <LifeguardRow watch={venue.lifeguard} />
      <SurroundingsRow setting={place.setting} />
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
  if (place.residents.length === 0) return <p className="ui-loading">Nobody sleeps here.</p>;
  return (
    <MemberList
      label="Who sleeps here"
      members={place.residents}
      selected={null}
      onSelectPerson={onSelectPerson}
    />
  );
}

// The same icon as the marker over the roof, so a click on one explains itself here.
function Problems({
  problems,
  hire,
}: {
  readonly problems: readonly Advice[];
  readonly hire: HireControls | undefined;
}) {
  if (problems.length === 0) return null;
  return (
    <ul className="hud-problems" aria-label="Problems">
      {problems.map((advice) => (
        <li
          key={adviceKey(advice)}
          className="hud-problem"
          data-severity={severityOf(advice) ?? 'note'}
        >
          <span className="hud-problem-icon">
            <PixelIcon name={adviceIcon(advice.kind)} />
          </span>
          <span>{adviceSays(advice)}</span>
          <HireButton advice={advice} hire={hire} />
        </li>
      ))}
    </ul>
  );
}

const SEND_LABELS: { readonly [role in OrderRole]: string } = {
  mechanic: 'Send a mechanic',
  cleaner: 'Send a cleaner',
};

const WHY_NOT: { readonly [state in Exclude<SendState, 'ready'>]: (role: OrderRole) => string } = {
  nobody: (role) => `No ${role} is on duty`,
  sent: (role) => `A ${role} is on the way`,
};

function SendButton({
  role,
  state,
  onSend,
}: {
  readonly role: OrderRole;
  readonly state: SendState | null;
  readonly onSend: (role: OrderRole) => void;
}) {
  if (state === null) return null;
  const why = state === 'ready' ? undefined : WHY_NOT[state](role);
  return (
    <button
      type="button"
      className="ui-button-large"
      disabled={why !== undefined}
      title={why}
      onClick={() => onSend(role)}
    >
      {why ?? SEND_LABELS[role]}
    </button>
  );
}

const NO_SEND: SendOffers = { mechanic: null, cleaner: null };

const offersAny = ({ mechanic, cleaner }: SendOffers): boolean =>
  mechanic !== null || cleaner !== null;

const hasActions = (place: PlaceView): boolean =>
  offersAny(place.send ?? NO_SEND) || place.programme !== undefined || place.naming !== undefined;

function ProgrammeButton({
  place,
  onOpenProgramme,
}: {
  readonly place: PlaceView;
  readonly onOpenProgramme: (key: string) => void;
}) {
  if (!place.programme) return null;
  return (
    <button type="button" className="ui-button-large" onClick={() => onOpenProgramme(place.key)}>
      Programme
    </button>
  );
}

function PlaceActions({
  place,
  onSend,
  onRenameVenue,
  onOpenProgramme,
}: {
  readonly place: PlaceView;
  readonly onSend: (role: OrderRole) => void;
  readonly onRenameVenue: (key: string, name: string) => void;
  readonly onOpenProgramme: (key: string) => void;
}) {
  if (!hasActions(place)) return null;
  const send = place.send ?? NO_SEND;
  return (
    <VenueActions
      // Keyed, so a half-typed name is not carried over to the next place selected.
      key={place.key}
      name={place.label}
      naming={place.naming}
      onRename={(name) => onRenameVenue(place.key, name)}
    >
      <SendButton role="mechanic" state={send.mechanic} onSend={onSend} />
      <SendButton role="cleaner" state={send.cleaner} onSend={onSend} />
      <ProgrammeButton place={place} onOpenProgramme={onOpenProgramme} />
    </VenueActions>
  );
}

function PlaceDetails({
  place,
  advice,
  onSelectPerson,
  onSend,
  hire,
  onRenameVenue,
  onOpenProgramme,
}: {
  readonly place: PlaceView;
  readonly advice: readonly Advice[];
  readonly onSelectPerson: (person: number) => void;
  readonly onSend: (role: OrderRole) => void;
  readonly hire: HireControls | undefined;
  readonly onRenameVenue: (key: string, name: string) => void;
  readonly onOpenProgramme: (key: string) => void;
}) {
  if (!place.venue) {
    return (
      <>
        <p className="ui-loading">Dressing: nothing here for a guest to do.</p>
        <dl className="ui-stats">
          <SurroundingsRow setting={place.setting} />
        </dl>
      </>
    );
  }
  return (
    <>
      <VenueKind naming={place.naming} />
      <Problems
        problems={adviceAt(advice, { tileX: place.tile.x, tileZ: place.tile.z })}
        hire={hire}
      />
      <VenueRows place={place} venue={place.venue} />
      <Residents place={place} onSelectPerson={onSelectPerson} />
      <PlaceActions
        place={place}
        onSend={onSend}
        onRenameVenue={onRenameVenue}
        onOpenProgramme={onOpenProgramme}
      />
    </>
  );
}

function StaffDetails({
  worker,
  activityElement,
  onShow,
}: {
  readonly worker: StaffView;
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onShow: () => void;
}) {
  return (
    <>
      <p className="ui-activity">
        <span ref={activityElement}>—</span>
      </p>
      <dl className="ui-stats">
        <StatRow label="Role">{worker.roleTitle}</StatRow>
        <StatRow label="Works">{worker.zone}</StatRow>
        <StatRow label="Shift">{worker.onDuty ? 'On duty' : 'Off duty'}</StatRow>
        <StatRow label="Wage">{worker.wage.toLocaleString('en-US')}/day</StatRow>
      </dl>
      {worker.onDuty ? (
        <div className="ui-actions">
          <button type="button" className="ui-button-large" onClick={onShow}>
            Show
          </button>
        </div>
      ) : null}
    </>
  );
}

function titleOf(selection: SelectionView): string {
  if (selection.kind === 'place') return selection.label;
  if (selection.kind === 'staff') return selection.name;
  return selection.child ? `${selection.name} (child)` : selection.name;
}

function Details({
  selection,
  advice,
  activityElement,
  onSelectPerson,
  onShow,
  onFollow,
  onSend,
  hire,
  onRenameVenue,
  onOpenProgramme,
}: Omit<InspectPanelProps, 'frame' | 'selection'> & { readonly selection: SelectionView }) {
  if (selection.kind === 'guest') {
    return (
      <GuestDetails
        guest={selection}
        activityElement={activityElement}
        onSelectPerson={onSelectPerson}
        onFollow={onFollow}
      />
    );
  }
  if (selection.kind === 'staff') {
    return <StaffDetails worker={selection} activityElement={activityElement} onShow={onShow} />;
  }
  return (
    <PlaceDetails
      place={selection}
      advice={advice}
      onSelectPerson={onSelectPerson}
      onSend={onSend}
      hire={hire}
      onRenameVenue={onRenameVenue}
      onOpenProgramme={onOpenProgramme}
    />
  );
}

export function InspectPanel({ frame, selection, ...details }: InspectPanelProps) {
  if (!selection) return null;

  return (
    <HudWindow
      frame={frame}
      title={titleOf(selection)}
      icon={selection.kind === 'place' ? 'resort' : 'guests'}
    >
      <div className="hud-inspect">
        <Details selection={selection} {...details} />
      </div>
    </HudWindow>
  );
}
