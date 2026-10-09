import { buildCostOf, nightPriceOf, priceOf } from '../../catalog/domain/prices';
import type { EventsState } from '../../events/domain/eventRuns';
import { stageKeysOf } from '../../events/domain/sites';
import { welcomeGapOf } from '../../events/domain/welcome';
import { bedCount, presentCount, type Guests } from '../../guests/domain/guests';
import type { Plot } from '../../resort-prep/domain/prepareResort';
import {
  keepDay,
  noteWelcomeGap,
  reportOf,
  startDay,
  type DayCounts,
  type DayReport,
} from '../../sim/domain/dayReport';
import { meanHappiness, type Happiness } from '../../sim/domain/happiness';
import { closeDay, record, type Ledger } from '../../sim/domain/ledger';
import { lodgingFor, type Lodging } from '../../sim/domain/lodgings';
import { paidShareOf } from '../../sim/domain/expectations';
import { ratingFor, type Rating } from '../../sim/domain/rating';
import { sceneryOver, type SceneryField } from '../../sim/domain/scenery';
import { wagesFor, type Roster } from '../../sim/domain/staff';
import { meanCleanliness } from '../../sim/domain/staffRouter';
import { maintenanceFor, nightBill, type VenueTakings } from '../../sim/domain/takings';
import type { ThoughtTally } from '../../sim/domain/thoughts';
import type { Upkeep } from '../../sim/domain/upkeep';
import type { Venue } from '../../sim/domain/venues';

export interface DayCloseState {
  readonly plot: Pick<Plot, 'placements' | 'props'>;
  ledger: Ledger;
  roster: Roster;
  readonly takings: VenueTakings;
  readonly guests: Guests;
  lodgings: readonly Lodging[];
  scenery: SceneryField;
  readonly happiness: Happiness;
  upkeep: Upkeep;
  venues: readonly Venue[];
  rating: Rating;
  today: DayCounts;
  history: readonly DayReport[];
  beds: { readonly total: number; readonly taken: number };
  readonly thoughtDay: Map<string, ThoughtTally>;
  events: Pick<EventsState, 'programme'>;
}

// Before the morning coach, so a day in the books runs from one check-in to the next.
export function payTheBills(resort: DayCloseState): void {
  const { plot } = resort;
  const standing = [...plot.placements, ...plot.props].map((placement) =>
    buildCostOf(placement.id),
  );
  const billed = record(resort.ledger, 'wages', -wagesFor(resort.roster));
  resort.ledger = closeDay(record(billed, 'maintenance', -maintenanceFor(standing)));
  resort.takings.clear();
  // Into the new day, so a lodging's takings show the morning's rent until the next one.
  const rent = nightBill(resort.guests, (home) => nightlyRate(resort, home), resort.takings);
  resort.ledger = record(resort.ledger, 'night', rent);
}

type RateState = Pick<DayCloseState, 'guests' | 'lodgings' | 'scenery'>;

function nightlyRate(resort: RateState, home: number): number {
  const { id, key } = resort.guests.homes[home]!;
  const lodging = resort.lodgings[lodgingFor(resort.lodgings, key)];
  return lodging ? nightPriceOf(id, sceneryOver(resort.scenery, lodging)) : priceOf(id);
}

export const paidShareFor = (resort: RateState, home: number): number =>
  paidShareOf(nightlyRate(resort, home), priceOf(resort.guests.homes[home]!.id));

export function rateTheDay(resort: DayCloseState): void {
  const beds = bedCount(resort.guests);
  resort.rating = ratingFor({
    happiness: meanHappiness(resort.happiness, resort.guests),
    present: presentCount(resort.guests),
    housed: beds.taken,
    cleanliness: meanCleanliness(resort.upkeep, resort.venues.length),
  });
}

// Before the morning coach, which counts towards the new day. The first check-in of a resort
// built that morning closes a period nobody played, so it only restarts the counts.
export function closeTheDay(resort: DayCloseState, day: number): void {
  if (resort.today.from !== day) {
    noteMissedWelcome(resort);
    const report = reportOf({
      counts: resort.today,
      rating: resort.rating,
      present: presentCount(resort.guests),
      beds: resort.beds,
      ledger: resort.ledger,
      thoughts: resort.thoughtDay,
    });
    resort.history = keepDay(resort.history, report);
  }
  resort.today = startDay(day);
}

// A day with no welcome run or called off had no stage for it, or had it switched off.
function noteMissedWelcome(resort: DayCloseState): void {
  if (resort.today.arrived === 0 || resort.today.welcome !== undefined) return;
  const gap = welcomeGapOf({
    programme: resort.events.programme,
    stages: stageKeysOf(resort.venues).length,
    held: false,
    called: false,
  });
  if (gap) resort.today = noteWelcomeGap(resort.today, gap);
}
