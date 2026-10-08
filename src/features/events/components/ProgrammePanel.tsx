import { useEffect, useRef, useState } from 'react';
import { HudTabs } from '../../hud/components/HudTabs';
import { PixelIcon } from '../../hud/components/PixelIcon';
import { SIGN_ICONS } from '../../hud/components/signIcons';
import type { BookingRefusal } from '../domain/programme';
import {
  DAY_PARTS,
  filterUpcoming,
  upcomingByDay,
  upcomingKinds,
  upcomingSites,
  type Chip,
  type FilterChoice,
  type ProgrammeView,
  type SiteType,
  type UpcomingFilter,
} from '../domain/programmeView';
import { START_STEP } from '../domain/week';
import { EventCards } from './EventCards';
import { refusalWords } from './eventWords';
import { ProgrammeWeek, PART_NAMES, type Cell } from './ProgrammeWeek';
import type { ProgrammeControls, ProgrammeTab } from './programmeControls';

export interface ProgrammePanelProps {
  readonly programme: ProgrammeControls;
}

type ViewProps = { readonly view: ProgrammeView } & ProgrammePanelProps;

const TABS: readonly ProgrammeTab[] = ['plan', 'upcoming'];

const TAB_TITLES: { readonly [tab in ProgrammeTab]: string } = {
  plan: 'Plan the week',
  upcoming: 'Coming up',
};

const typeIcon = (type: SiteType) => (type.sign ? SIGN_ICONS[type.sign] : 'clear');

function TypePicker({ view, programme }: ViewProps) {
  const current = view.site?.type;
  return (
    <div className="hud-programme-types" role="group" aria-label="Kind of stage">
      {view.types.map((type) => (
        <button
          key={type.key}
          type="button"
          className="hud-camera-mode hud-programme-type"
          aria-pressed={type.key === current}
          aria-label={type.label}
          title={type.label}
          onClick={() => programme.choose(type.sites[0]!.key)}
        >
          <PixelIcon name={typeIcon(type)} />
          {type.sites.length > 1 ? (
            <span className="hud-tool-badge" aria-hidden="true">
              {type.sites.length}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// A select rather than a button each, so a resort with a dozen stages of a kind still fits.
function SitePicker({ view, programme }: ViewProps) {
  const site = view.site!;
  const type = view.types.find((each) => each.key === site.type);
  return (
    <div className="hud-programme-site">
      <span className="hud-programme-heading">{type?.label}</span>
      {type && type.sites.length > 1 ? (
        <select
          className="hud-select"
          aria-label={`Which ${type.label}`}
          value={site.key}
          onChange={(event) => programme.choose(event.target.value)}
        >
          {type.sites.map((each) => (
            <option key={each.key} value={each.key}>
              {each.label}
            </option>
          ))}
        </select>
      ) : (
        <strong>{site.label}</strong>
      )}
    </div>
  );
}

function Refusal({ refusal }: { readonly refusal: BookingRefusal | null }) {
  if (!refusal) return null;
  return (
    <p className="hud-event-refusal" role="alert">
      {refusalWords(refusal)}
    </p>
  );
}

// A title as well as disabled, so the mouse at least is told why nothing would happen.
function ActionButton(props: {
  readonly label: string;
  readonly allowed: boolean;
  readonly why: string;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="hud-camera-mode"
      disabled={!props.allowed}
      title={props.allowed ? undefined : props.why}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  );
}

const BLOCKED = 'Something else is on then, or it would run past its hours';

function EndButton({ chip, programme }: { readonly chip: Chip } & ProgrammePanelProps) {
  if (!chip.builtIn) {
    return (
      <ActionButton label="Remove" allowed why="" onPress={() => programme.unbook(chip.booking)} />
    );
  }
  return (
    <ActionButton
      label={chip.off ? 'Switch on' : 'Switch off'}
      allowed={chip.canSwitch}
      why="Something else is on then"
      onPress={() => programme.switchBuiltIn(chip.booking, chip.off)}
    />
  );
}

// Follows the booking to its new stage, where its chip is shown.
function SiteSelect(props: {
  readonly chip: Chip;
  readonly programme: ProgrammeControls;
  readonly onRefusal: (refusal: BookingRefusal | null) => void;
}) {
  const { chip, programme } = props;
  const here = chip.sites.find((each) => each.here);
  if (!here) return null;
  return (
    <select
      className="hud-select"
      aria-label="Move to"
      value={here.key}
      onChange={(event) => {
        const to = chip.sites.find((each) => each.key === event.target.value);
        if (!to || to.here) return;
        const refusal = programme.rebook(chip.booking, { site: to.site });
        props.onRefusal(refusal);
        if (refusal === null) programme.choose(to.key);
      }}
    >
      {chip.sites.map((each) => (
        <option key={each.key} value={each.key} disabled={!each.allowed}>
          {each.label}
        </option>
      ))}
    </select>
  );
}

function ChipActions({ chip, programme }: { readonly chip: Chip } & ProgrammePanelProps) {
  const [refusal, setRefusal] = useState<BookingRefusal | null>(null);
  const move = (by: number) => () =>
    setRefusal(programme.rebook(chip.booking, { start: chip.minute + by }));
  return (
    <div className="hud-programme-form">
      <div className="hud-programme-actions">
        <span>
          {chip.time} {chip.label} · {chip.repeat}
        </span>
        <ActionButton
          label="Earlier"
          allowed={chip.earlier}
          why={BLOCKED}
          onPress={move(-START_STEP)}
        />
        <ActionButton label="Later" allowed={chip.later} why={BLOCKED} onPress={move(START_STEP)} />
        <SiteSelect chip={chip} programme={programme} onRefusal={setRefusal} />
        <EndButton chip={chip} programme={programme} />
      </div>
      <Refusal refusal={refusal} />
    </div>
  );
}

function CellCards({
  view,
  cell,
  programme,
  onBooked,
  onClose,
}: ViewProps & {
  readonly cell: Cell;
  readonly onBooked: () => void;
  readonly onClose: () => void;
}) {
  const day = view.days.find((each) => each.day === cell.day);
  const site = view.site;
  if (!day || !site) return null;
  return (
    <div className="hud-programme-form">
      <div className="hud-programme-form-head">
        <h3 className="hud-programme-heading">
          {day.name}, {PART_NAMES[cell.part].toLowerCase()} at {site.label}
        </h3>
        <button type="button" className="hud-camera-mode" onClick={onClose}>
          Close
        </button>
      </div>
      <EventCards
        key={`${site.key}:${cell.day}:${cell.part}`}
        cards={programme.cardsAt(cell.day, cell.part)}
        onBook={(kind, start, repeat, tier) => {
          const refusal = programme.book({
            kind,
            site: site.site,
            repeat,
            start,
            ...(tier ? { tier } : {}),
          });
          if (refusal === null) onBooked();
          return refusal;
        }}
      />
    </div>
  );
}

const chipIn = (view: ProgrammeView, booking: number | null): Chip | undefined =>
  view.days
    .flatMap((day) => DAY_PARTS.flatMap((part) => day.parts[part]))
    .find((chip) => chip.booking === booking);

function formKey(cell: Cell | null, chip: Chip | undefined): string | null {
  if (cell) return `${cell.day}:${cell.part}`;
  return chip ? `chip:${chip.booking}` : null;
}

// The form opens under the week, which can be a long way down a phone's sheet.
function useShownOnOpen(open: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open !== null) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);
  return ref;
}

function Booking({ view, programme }: ViewProps) {
  const [cell, setCell] = useState<Cell | null>(null);
  const [booking, setBooking] = useState<number | null>(null);
  const chip = chipIn(view, booking);
  const formRef = useShownOnOpen(formKey(cell, chip));
  return (
    <>
      <ProgrammeWeek
        days={view.days}
        cell={cell}
        chip={booking}
        onCell={(next) => {
          setCell(next);
          setBooking(null);
        }}
        onChip={(next) => {
          setBooking(next === booking ? null : next);
          setCell(null);
        }}
      />
      <div ref={formRef}>
        {chip ? <ChipActions key={chip.booking} chip={chip} programme={programme} /> : null}
        {cell ? (
          <CellCards
            view={view}
            cell={cell}
            programme={programme}
            onBooked={() => setCell(null)}
            onClose={() => setCell(null)}
          />
        ) : null}
      </div>
    </>
  );
}

function Plan({ view, programme }: ViewProps) {
  return (
    <>
      <div className="hud-programme-picker">
        <TypePicker view={view} programme={programme} />
        <SitePicker view={view} programme={programme} />
      </div>
      {/* Keyed on the stage, so a cell picked on one is not left open over another's week. */}
      <Booking key={view.site?.key} view={view} programme={programme} />
    </>
  );
}

// A choice that has dropped out of the list, its last event over, reads as no filter at all.
const kept = <T extends string>(id: T | null, choices: readonly FilterChoice<T>[]): T | null =>
  choices.some((choice) => choice.id === id) ? id : null;

function FilterSelect<T extends string>(props: {
  readonly label: string;
  readonly all: string;
  readonly value: T | null;
  readonly choices: readonly FilterChoice<T>[];
  readonly onPick: (id: T | null) => void;
}) {
  return (
    <select
      className="hud-select"
      aria-label={props.label}
      value={props.value ?? ''}
      onChange={(event) => props.onPick((event.target.value || null) as T | null)}
    >
      <option value="">{props.all}</option>
      {props.choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function ComingUp({ view }: { readonly view: ProgrammeView }) {
  const [asked, setFilter] = useState<UpcomingFilter>({ kind: null, site: null });
  const kinds = upcomingKinds(view.upcoming);
  const sites = upcomingSites(view.upcoming);
  const filter = { kind: kept(asked.kind, kinds), site: kept(asked.site, sites) };
  const days = upcomingByDay(filterUpcoming(view.upcoming, filter));
  if (view.upcoming.length === 0) return <p className="hud-loading">Nothing booked yet.</p>;
  return (
    <>
      <div className="hud-programme-filters">
        <FilterSelect
          label="Which events"
          all="All events"
          value={filter.kind}
          choices={kinds}
          onPick={(kind) => setFilter({ ...filter, kind })}
        />
        <FilterSelect
          label="Which stage"
          all="All stages"
          value={filter.site}
          choices={sites}
          onPick={(site) => setFilter({ ...filter, site })}
        />
      </div>
      {days.length === 0 ? (
        <p className="hud-loading">Nothing like that this week.</p>
      ) : (
        <ol className="hud-programme-upcoming">
          {days.map((day) => (
            <li key={day.day} className="hud-programme-upcoming-day">
              <h3 className="hud-programme-heading">{day.name}</h3>
              <ol>
                {day.events.map((each) => (
                  <li key={each.key}>
                    {each.time} {each.label}
                    <span className="hud-stat-note"> · {each.site}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function ProgrammePanel({ programme }: ProgrammePanelProps) {
  const { view } = programme;
  if (!view) return null;
  if (!view.site) {
    return <p className="hud-loading">Build somewhere with a stage to put on events.</p>;
  }
  return (
    <div className="hud-programme">
      <HudTabs
        tabs={TABS}
        current={programme.tab}
        onPick={programme.showTab}
        titleOf={(tab) => TAB_TITLES[tab]}
        label="Programme"
      />
      {programme.tab === 'plan' ? (
        <Plan view={view} programme={programme} />
      ) : (
        <ComingUp view={view} />
      )}
    </div>
  );
}
