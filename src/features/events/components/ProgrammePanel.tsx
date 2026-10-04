import { useState } from 'react';
import type { ProgrammeControls } from '../../../app/useProgramme';
import { DAY_PARTS, type Chip, type ProgrammeView } from '../domain/programmeView';
import { START_STEP } from '../domain/week';
import { EventCards } from './EventCards';
import { refusalWords } from './eventWords';
import { ProgrammeWeek, type Cell } from './ProgrammeWeek';

export interface ProgrammePanelProps {
  readonly programme: ProgrammeControls;
}

function SiteTabs({ view, programme }: { readonly view: ProgrammeView } & ProgrammePanelProps) {
  return (
    <div className="hud-programme-sites" role="group" aria-label="Stages">
      {view.sites.map((site) => (
        <button
          key={site.key}
          type="button"
          className="hud-camera-mode"
          aria-pressed={site.key === view.site?.key}
          onClick={() => programme.choose(site.key)}
        >
          {site.label}
        </button>
      ))}
    </div>
  );
}

function ChipActions({ chip, programme }: { readonly chip: Chip } & ProgrammePanelProps) {
  const move = (by: number) => programme.rebook(chip.booking, { start: chip.minute + by });
  return (
    <div className="hud-programme-actions">
      <span>
        <span className="hud-num">{chip.time}</span> {chip.label} · {chip.repeat}
      </span>
      <button type="button" className="hud-camera-mode" onClick={() => move(-START_STEP)}>
        Earlier
      </button>
      <button type="button" className="hud-camera-mode" onClick={() => move(START_STEP)}>
        Later
      </button>
      {chip.builtIn ? (
        <button
          type="button"
          className="hud-camera-mode"
          onClick={() => programme.switchBuiltIn(chip.booking, chip.off)}
        >
          {chip.off ? 'Switch on' : 'Switch off'}
        </button>
      ) : (
        <button
          type="button"
          className="hud-camera-mode"
          onClick={() => programme.unbook(chip.booking)}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function CellCards({
  view,
  cell,
  programme,
}: { readonly view: ProgrammeView; readonly cell: Cell } & ProgrammePanelProps) {
  const day = view.days.find((each) => each.day === cell.day);
  const site = view.site;
  if (!day || !site) return null;
  return (
    <EventCards
      key={`${cell.day}:${cell.part}`}
      cards={view.cards[cell.part]}
      repeats={day.repeats}
      onBook={(kind, start, repeat) => programme.book({ kind, site: site.site, repeat, start })}
    />
  );
}

function Upcoming({ view }: { readonly view: ProgrammeView }) {
  if (view.upcoming.length === 0) return <p className="hud-loading">Nothing booked yet.</p>;
  return (
    <ol className="hud-programme-upcoming">
      {view.upcoming.map((each) => (
        <li key={each.key}>
          <span className="hud-num">{each.when}</span> {each.label}
          <span className="hud-stat-note"> · {each.site}</span>
        </li>
      ))}
    </ol>
  );
}

const chipIn = (view: ProgrammeView, booking: number | null): Chip | undefined =>
  view.days
    .flatMap((day) => DAY_PARTS.flatMap((part) => day.parts[part]))
    .find((chip) => chip.booking === booking);

function Booking({ view, programme }: { readonly view: ProgrammeView } & ProgrammePanelProps) {
  const [cell, setCell] = useState<Cell | null>(null);
  const [booking, setBooking] = useState<number | null>(null);
  const chip = chipIn(view, booking);
  return (
    <>
      <ProgrammeWeek
        days={view.days}
        bookable={new Set(DAY_PARTS.filter((part) => view.cards[part].length > 0))}
        cell={cell}
        chip={booking}
        onCell={(next) => {
          setCell(next);
          setBooking(null);
        }}
        onChip={(next) => {
          setBooking(next);
          setCell(null);
        }}
      />
      {chip ? <ChipActions chip={chip} programme={programme} /> : null}
      {cell ? <CellCards view={view} cell={cell} programme={programme} /> : null}
      {programme.refusal ? (
        <p className="hud-event-warning" role="status">
          {refusalWords(programme.refusal)}
        </p>
      ) : null}
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
      <SiteTabs view={view} programme={programme} />
      <Booking view={view} programme={programme} />
      <h3 className="hud-programme-heading">Coming up</h3>
      <Upcoming view={view} />
    </div>
  );
}
