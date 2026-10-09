import type { RefObject } from 'react';
import type {
  GuestView,
  LifeguardWatch,
  PartyMemberView,
  PlaceView,
  SelectionView,
  SendState,
  StaffView,
} from '../../inspect/domain/selection';
import type { OrderRole } from '../../sim/domain/staffRouter';
import type { Advice } from '../../sim/domain/advice';
import { adviceAt, markerIconOf } from '../domain/markers';
import { adviceKey, severityOf } from '../domain/news';
import { adviceSays } from './adviceWords';
import { HireButton, type HireControls } from './HireButton';
import { HudWindow, type HudWindowFrame } from './HudWindow';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { StatRow } from '../../../shared/components/StatRow';
import { NeedBars, PARTY_KINDS, ThinksRow } from './GuestRows';
import { VenueName } from './VenueName';

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
      <div className="hud-inspect-members">
        <button type="button" className="ui-button" onClick={onFollow}>
          Follow
        </button>
      </div>
      <dl className="ui-stats">
        <StatRow label="Party">{PARTY_KINDS[guest.partyKind]}</StatRow>
        <StatRow label="Sleeps">{guest.home ? guest.home.label : 'No bed on the plot'}</StatRow>
        <StatRow label="Stay">{stayLine(guest)}</StatRow>
        {guest.welcomed ? <StatRow label="Welcome meeting">attended</StatRow> : null}
        <StatRow label="Mood">{Math.round(guest.happiness * 100)}%</StatRow>
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

function VenueRows({ venue, setting }: { readonly venue: Venue; readonly setting: number }) {
  return (
    <dl className="ui-stats">
      <StatRow label="Role">{ROLES[venue.role]}</StatRow>
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
      <StatRow label="Takings today">{venue.takings.toLocaleString('en-US')}</StatRow>
      <LifeguardRow watch={venue.lifeguard} />
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
    <ul className="hud-inspect-problems" aria-label="Problems">
      {problems.map((advice) => {
        const icon = markerIconOf(advice.kind);
        return (
          <li
            key={adviceKey(advice)}
            className="hud-inspect-problem"
            data-severity={severityOf(advice) ?? 'note'}
          >
            <span className="hud-inspect-problem-icon">
              {icon ? <PixelIcon name={icon} /> : null}
            </span>
            <span>{adviceSays(advice)}</span>
            <HireButton advice={advice} hire={hire} />
          </li>
        );
      })}
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
      className="ui-button"
      disabled={why !== undefined}
      title={why}
      onClick={() => onSend(role)}
    >
      {why ?? SEND_LABELS[role]}
    </button>
  );
}

function SendButtons({
  place,
  onSend,
}: {
  readonly place: PlaceView;
  readonly onSend: (role: OrderRole) => void;
}) {
  const send = place.send;
  if (!send || (send.mechanic === null && send.cleaner === null)) return null;
  return (
    <div className="hud-inspect-members" role="group" aria-label="Send staff">
      <SendButton role="mechanic" state={send.mechanic} onSend={onSend} />
      <SendButton role="cleaner" state={send.cleaner} onSend={onSend} />
    </div>
  );
}

function ProgrammeRow({
  place,
  onOpenProgramme,
}: {
  readonly place: PlaceView;
  readonly onOpenProgramme: (key: string) => void;
}) {
  if (!place.programme) return null;
  return (
    <div className="ui-row ui-row--spread">
      <span>{place.programme.next ?? 'Nothing on this week'}</span>
      <button type="button" className="ui-button" onClick={() => onOpenProgramme(place.key)}>
        Programme
      </button>
    </div>
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
      {place.naming ? (
        <VenueName
          // Keyed, so a half-typed name is not carried over to the next place selected.
          key={place.key}
          name={place.label}
          naming={place.naming}
          onRename={(name) => onRenameVenue(place.key, name)}
        />
      ) : null}
      <Problems
        problems={adviceAt(advice, { tileX: place.tile.x, tileZ: place.tile.z })}
        hire={hire}
      />
      <SendButtons place={place} onSend={onSend} />
      <ProgrammeRow place={place} onOpenProgramme={onOpenProgramme} />
      <VenueRows venue={place.venue} setting={place.setting} />
      <Residents place={place} onSelectPerson={onSelectPerson} />
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
        <div className="hud-inspect-members">
          <button type="button" className="ui-button" onClick={onShow}>
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
