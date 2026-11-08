import { premiumOf, type BookingsState } from '../../bookings/domain/bookings';
import { buildCostOf, chargeOf, nightPriceOf, priceOf } from '../../catalog/domain/prices';
import type { EventsState } from '../../events/domain/eventRuns';
import { welcomeSitesOf } from '../../events/domain/sites';
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
import { conditionOf, rateFactor, upkeepFactor, type Condition } from '../../sim/domain/condition';
import { meanHappiness, type Happiness } from '../../sim/domain/happiness';
import { closeDay, record, type Ledger } from '../../sim/domain/ledger';
import { lodgingFor, type Lodging } from '../../sim/domain/lodgings';
import { paidShareOf } from '../../sim/domain/expectations';
import { quietFactor, type NoisyNight } from '../../sim/domain/nightNoise';
import { factorOf, type Prices } from '../../sim/domain/pricing';
import { prestigeAfterDay, type Prestige } from '../../sim/domain/prestige';
import { ratingFor, type Rating } from '../../sim/domain/rating';
import { isSeasonDay, tallyDay, type Season, type SeasonTally } from '../../sim/domain/season';
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
  prestige: Prestige;
  readonly open: boolean;
  readonly prices: Prices;
  readonly condition: Condition;
  lastNightNoise: ReadonlyMap<string, NoisyNight>;
  readonly season: Season | null;
  seasonTally: SeasonTally;
  today: DayCounts;
  history: readonly DayReport[];
  beds: { readonly total: number; readonly taken: number };
  readonly thoughtDay: Map<string, ThoughtTally>;
  events: Pick<EventsState, 'programme'>;
  readonly bookings: BookingsState;
}

// Before the morning coach, so a day in the books runs from one check-in to the next.
export function payTheBills(resort: DayCloseState): void {
  const { plot, condition } = resort;
  // A key that never ages is never in the map, so reads as new: props and paths cost what they did.
  const standing = [
    ...plot.placements.map(
      ({ id, key }) => buildCostOf(id) * upkeepFactor(conditionOf(condition, key)),
    ),
    ...plot.props.map(({ id }) => buildCostOf(id)),
  ];
  const billed = record(resort.ledger, 'wages', -wagesFor(resort.roster));
  resort.ledger = closeDay(record(billed, 'maintenance', -maintenanceFor(standing)));
  resort.takings.clear();
  // Into the new day, so a lodging's takings show the morning's rent until the next one.
  const rent = nightBill(
    resort.guests,
    (home) => nightlyRate(resort, home),
    resort.takings,
    premiumOf(resort.bookings, resort.guests.party),
  );
  resort.ledger = record(resort.ledger, 'night', rent);
}

type RateState = Pick<
  DayCloseState,
  'guests' | 'lodgings' | 'scenery' | 'prices' | 'condition' | 'lastNightNoise'
>;

export function nightlyRate(resort: RateState, home: number): number {
  const { id, key } = resort.guests.homes[home]!;
  const lodging = resort.lodgings[lodgingFor(resort.lodgings, key)];
  // Into the factor, so the rate is rounded once.
  const factor =
    factorOf(resort.prices, id) *
    rateFactor(conditionOf(resort.condition, key)) *
    quietFactor(resort.lastNightNoise.get(key)?.felt ?? 0);
  return lodging
    ? nightPriceOf(id, sceneryOver(resort.scenery, lodging), factor)
    : chargeOf(id, factor);
}

export const paidShareFor = (resort: RateState, home: number): number =>
  paidShareOf(nightlyRate(resort, home), priceOf(resort.guests.homes[home]!.id));

// A season's first morning finds the resort emptied by the last one's end, and keeps its stars.
// Only that morning: an empty resort rated one star must still be reset, or nobody ever books it.
export function rateTheDay(resort: DayCloseState): void {
  const beds = bedCount(resort.guests);
  const firstMorning = resort.season !== null && resort.seasonTally.days === 0;
  resort.rating = ratingFor({
    happiness: meanHappiness(resort.happiness, resort.guests),
    present: presentCount(resort.guests),
    housed: beds.taken,
    cleanliness: meanCleanliness(resort.upkeep, resort.venues.length),
    ...(firstMorning ? { previous: resort.rating } : {}),
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
    const reached = holdTheRating(resort, report);
    const told = reached.length > 0 ? { ...report, reached } : report;
    resort.history = keepDay(resort.history, told);
    tallySeasonDay(resort, told);
  }
  resort.today = startDay(day);
}

// By the day reported on, not the state: the closing day's report is written at the next
// season's first check-in, and belongs to neither.
function tallySeasonDay(resort: DayCloseState, report: DayReport): void {
  const { season } = resort;
  if (!season || season.state === 'break' || !isSeasonDay(season, report.day)) return;
  resort.seasonTally = tallyDay(resort.seasonTally, report);
}

// A shut resort keeps its streaks: a break is no day the guests could judge. The closing day's
// report, written at the next season's first check-in, belongs to no season, so it counts neither.
function holdTheRating(resort: DayCloseState, report: DayReport): readonly number[] {
  const { season } = resort;
  if (!resort.open) return [];
  if (season && (season.state === 'break' || !isSeasonDay(season, report.day))) return [];
  const { prestige, newly } = prestigeAfterDay(resort.prestige, report.rating.stars, report.day);
  resort.prestige = prestige;
  return newly;
}

// A day with no welcome run or called off had no stage for it, or had it switched off.
function noteMissedWelcome(resort: DayCloseState): void {
  if (resort.today.arrived === 0 || resort.today.welcome !== undefined) return;
  const gap = welcomeGapOf({
    programme: resort.events.programme,
    sites: welcomeSitesOf(resort.venues).length,
    held: false,
    called: false,
  });
  if (gap) resort.today = noteWelcomeGap(resort.today, gap);
}
