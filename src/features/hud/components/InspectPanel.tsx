import type { ReactNode, RefObject } from 'react';
import type {
  GuestView,
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
import { HudWindow, type HudWindowFrame } from './HudWindow';
import { PixelIcon } from './PixelIcon';
import { StatRow } from './StatRow';
import { thoughtLine } from './thoughtWords';

export interface InspectPanelProps {
  readonly frame: HudWindowFrame;
  readonly selection: SelectionView | null;
  readonly advice: readonly Advice[];
  // Written per frame by the overlay, so the panel never re-renders as the resort ticks.
  readonly activityElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  // Looks at the inspected worker where they are now: staff walk off while the panel is open.
  readonly onShow: () => void;
  readonly onSend: (role: OrderRole) => void;
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
  health: 'Health',
};

const ROLES: { readonly [role in NonNullable<PlaceView['venue']>['role']]: string } = {
  lodging: 'Lodging',
  food: 'Food',
  drink: 'Drinks',
  activity: 'Activity',
  service: 'Service',
};

// Pixel digits blur into each other, so every figure in the panel is set in the plain face.
const Num = ({ children }: { readonly children: ReactNode }) => (
  <span className="hud-num">{children}</span>
);

// Keyed by where the figure starts in the text, which is what tells two figures apart.
const withFigures = (text: string): ReactNode => {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(/\d[\d,.]*%?/g)) {
    parts.push(text.slice(from, match.index), <Num key={match.index}>{match[0]}</Num>);
    from = match.index + match[0].length;
  }
  parts.push(text.slice(from));
  return parts;
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
  return <StatRow label="Wants">{wants.label}</StatRow>;
}

function ThinksRow({ thought }: { readonly thought: GuestView['thought'] }) {
  return (
    <dl className="hud-stats hud-advice">
      <StatRow label="Thinks">
        {thought ? `“${thoughtLine(thought.kind, thought.subject)}”` : 'Nothing yet'}
      </StatRow>
    </dl>
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
        <StatRow label="Party">{PARTY_KINDS[guest.partyKind]}</StatRow>
        <StatRow label="Sleeps">{guest.home ? guest.home.label : 'No bed on the plot'}</StatRow>
        <StatRow label="Stay">{withFigures(stayLine(guest))}</StatRow>
        <StatRow label="Mood">
          <Num>{Math.round(guest.happiness * 100)}%</Num>
        </StatRow>
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
  return (
    <StatRow label="Surroundings">
      <Num>{Math.round(setting * 100)}%</Num>
    </StatRow>
  );
}

function LifeguardRow({ watched }: { readonly watched: boolean | null }) {
  if (watched === null) return null;
  return <StatRow label="Lifeguard">{watched ? 'On watch' : 'Nobody watching'}</StatRow>;
}

function BrokenRow({ broken }: { readonly broken: boolean }) {
  if (!broken) return null;
  return <StatRow label="Repairs">Broken down</StatRow>;
}

function VenueRows({ venue, setting }: { readonly venue: Venue; readonly setting: number }) {
  return (
    <dl className="hud-stats">
      <StatRow label="Role">{ROLES[venue.role]}</StatRow>
      <BrokenRow broken={venue.broken} />
      <StatRow label="Capacity">
        <Num>{venue.capacity}</Num>
      </StatRow>
      {venue.role === 'lodging' ? (
        <StatRow label="Beds">
          <Num>{venue.beds}</Num>
        </StatRow>
      ) : (
        <StatRow label="Serves">{venue.serves.join(', ') || '—'}</StatRow>
      )}
      <StatRow label="Typical stay">{venue.dwell}</StatRow>
      <StatRow label="Inside">
        <Num>
          {venue.inside} / {venue.capacity}
        </Num>
      </StatRow>
      <StatRow label="Waiting">
        {venue.waiting === 0 ? 'Nobody' : <Num>{venue.waiting}</Num>}
      </StatRow>
      <StatRow label="Cleanliness">
        <Num>{Math.round(venue.cleanliness * 100)}%</Num>
      </StatRow>
      <StatRow label="Takings today">
        <Num>{venue.takings.toLocaleString('en-US')}</Num>
      </StatRow>
      <LifeguardRow watched={venue.watched} />
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

// The same icon as the marker over the roof, so a click on one explains itself here.
function Problems({ problems }: { readonly problems: readonly Advice[] }) {
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
            <span>{withFigures(adviceSays(advice))}</span>
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
      className="hud-camera-mode"
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

function PlaceDetails({
  place,
  advice,
  onSelectPerson,
  onSend,
}: {
  readonly place: PlaceView;
  readonly advice: readonly Advice[];
  readonly onSelectPerson: (person: number) => void;
  readonly onSend: (role: OrderRole) => void;
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
      <Problems problems={adviceAt(advice, { tileX: place.tile.x, tileZ: place.tile.z })} />
      <SendButtons place={place} onSend={onSend} />
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
      <p className="hud-inspect-activity">
        <span ref={activityElement}>—</span>
      </p>
      <dl className="hud-stats">
        <StatRow label="Role">{worker.roleTitle}</StatRow>
        <StatRow label="Works">{worker.zone}</StatRow>
        <StatRow label="Shift">{worker.onDuty ? 'On duty' : 'Off duty'}</StatRow>
        <StatRow label="Wage">
          <Num>{worker.wage.toLocaleString('en-US')}</Num>/day
        </StatRow>
      </dl>
      {worker.onDuty ? (
        <div className="hud-inspect-members">
          <button type="button" className="hud-camera-mode" onClick={onShow}>
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
  onSend,
}: Omit<InspectPanelProps, 'frame' | 'selection'> & { readonly selection: SelectionView }) {
  if (selection.kind === 'guest') {
    return (
      <GuestDetails
        guest={selection}
        activityElement={activityElement}
        onSelectPerson={onSelectPerson}
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
