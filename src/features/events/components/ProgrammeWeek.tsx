import { useState } from 'react';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { PosterDay } from '../domain/poster';
import { DAY_PARTS, type Chip, type DayColumn, type DayPart } from '../domain/programmeView';
import { ProgrammePoster } from './ProgrammePoster';

export interface Cell {
  readonly day: number;
  readonly part: DayPart;
}

export interface ProgrammeWeekProps {
  readonly days: readonly DayColumn[];
  readonly poster: readonly PosterDay[];
  readonly cell: Cell | null;
  readonly chip: number | null;
  readonly onCell: (cell: Cell) => void;
  readonly onChip: (booking: number) => void;
}

export const PART_NAMES: { readonly [part in DayPart]: string } = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

function DayHead({ day }: { readonly day: DayColumn }) {
  return (
    <div className="events-programme-day-head">
      <span>{day.name}</span>
      {day.weather ? (
        <span title={day.pinned ? `${day.weather}, pinned` : day.weather}>
          <PixelIcon name={day.weather} scale={1} />
        </span>
      ) : null}
    </div>
  );
}

function ChipButton({
  chip,
  chosen,
  onChip,
}: {
  readonly chip: Chip;
  readonly chosen: boolean;
  readonly onChip: (booking: number) => void;
}) {
  return (
    <button
      type="button"
      className="events-programme-chip"
      aria-pressed={chosen}
      data-off={chip.off ? '' : undefined}
      title={[chip.label, chip.repeat.toLowerCase(), chip.fee && `${chip.fee} a show`]
        .filter(Boolean)
        .join(', ')}
      onClick={() => onChip(chip.booking)}
    >
      {chip.time} {chip.label}
    </button>
  );
}

function PartCell({
  day,
  part,
  ...props
}: { readonly day: DayColumn; readonly part: DayPart } & GridProps) {
  const chosen = props.cell?.day === day.day && props.cell.part === part;
  return (
    <div className="events-programme-cell" data-part={part}>
      {day.parts[part].map((chip) => (
        <ChipButton
          key={chip.booking}
          chip={chip}
          chosen={props.chip === chip.booking}
          onChip={props.onChip}
        />
      ))}
      {/* None where nothing more fits, such as a past evening or the welcome's morning. */}
      {day.open[part] ? (
        <button
          type="button"
          className="events-programme-add"
          aria-pressed={chosen}
          aria-label={`Book something for ${day.name}, ${part}`}
          onClick={() => props.onCell({ day: day.day, part })}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

type GridProps = Omit<ProgrammeWeekProps, 'days' | 'poster'>;

// Days as rows and the parts of the day as columns, so a phone's sheet shows it as a desk does.
function WeekGrid({ days, ...props }: GridProps & { readonly days: readonly DayColumn[] }) {
  return (
    <div className="events-programme-week">
      <span className="events-programme-part-head" aria-hidden="true" />
      {DAY_PARTS.map((part) => (
        <span key={part} className="events-programme-part-head">
          {PART_NAMES[part]}
        </span>
      ))}
      {days.map((day) => (
        <div key={day.day} className="events-programme-day">
          <DayHead day={day} />
          {DAY_PARTS.map((part) => (
            <PartCell key={part} day={day} part={part} {...props} />
          ))}
        </div>
      ))}
    </div>
  );
}

type Shown = 'grid' | 'poster';

const SHOWN_NAMES: { readonly [shown in Shown]: string } = {
  grid: 'Plan',
  poster: 'Poster',
};

export function ProgrammeWeek({ days, poster, ...props }: ProgrammeWeekProps) {
  const [shown, setShown] = useState<Shown>('grid');
  return (
    <>
      <div className="ui-row" role="group" aria-label="Show the week as">
        {(['grid', 'poster'] as const).map((each) => (
          <button
            key={each}
            type="button"
            className="ui-button"
            aria-pressed={shown === each}
            onClick={() => setShown(each)}
          >
            {SHOWN_NAMES[each]}
          </button>
        ))}
      </div>
      {shown === 'grid' ? <WeekGrid days={days} {...props} /> : <ProgrammePoster days={poster} />}
    </>
  );
}
