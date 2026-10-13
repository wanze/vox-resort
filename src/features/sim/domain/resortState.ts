import { restoreGuests, snapshotGuests, type Guests } from '../../guests/domain/guests';
import { resumeRandom, type Random } from '../../layout/domain/random';
import type { Footfall } from '../../overlays/domain/overlays';
import { restoreBreakdowns, snapshotBreakdowns, type Breakdowns } from './breakdowns';
import { settledFor, type Condition } from './condition';
import type { DayCounts, DayReport, PhotoTally } from './dayReport';
import { restoreHappiness, snapshotHappiness, type Happiness } from './happiness';
import type { Ledger } from './ledger';
import { restorePhotos, snapshotPhotos, type Photos } from './photos';
import type { Carrying, Litter } from './litter';
import { restoreNeeds, snapshotNeeds, type Needs } from './needs';
import type { Prices } from './pricing';
import type { Rating } from './rating';
import type { ResortSnapshot } from './resortSnapshot';
import type { Review } from './reviews';
import {
  seasonOfOldSave,
  startTally,
  type Season,
  type SeasonReport,
  type SeasonTally,
} from './season';
import type { Hiring } from './staff';
import type { VenueTakings } from './takings';
import { restoreThoughts, snapshotThoughts, type Thoughts, type ThoughtTally } from './thoughts';
import { restoreUpkeep, snapshotUpkeep, type Upkeep } from './upkeep';
import type { Zones } from './zones';

// The guest side of a resort, which the showcase's Resort satisfies. Everything here is either
// written into in place or replaced whole, so a restore never leaves a stale alias behind.
export interface ResortState {
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  readonly thoughts: Thoughts;
  readonly thoughtDay: Map<string, ThoughtTally>;
  readonly carrying: Carrying;
  readonly litter: Litter;
  upkeep: Upkeep;
  breakdowns: Breakdowns;
  readonly venues: readonly { readonly key: string }[];
  readonly lodgings: readonly { readonly key: string }[];
  readonly takings: VenueTakings;
  // Placement key to name, as naming/domain/venueNames.ts draws them.
  names: ReadonlyMap<string, string>;
  readonly footfall: Footfall;
  reviews: readonly Review[];
  today: DayCounts;
  history: readonly DayReport[];
  rating: Rating;
  ledger: Ledger;
  arrivalsPlanned: number;
  arrivalsAdmitted: number;
  arrivals: Random;
  open: boolean;
  beds: { readonly total: number; readonly taken: number };
  hiring: Hiring;
  // Per worker, gone home for the night: without it a load at night would clock them on again.
  staffOff: Uint8Array;
  prices: Prices;
  condition: Condition;
  // Placement key to the tick its renovation ends; the building is shut until then.
  renovating: ReadonlyMap<string, number>;
  // A lodging paid for and closed to new guests, by key to what was paid, until it empties.
  closing: ReadonlyMap<string, number>;
  readonly zones: Zones;
  readonly photos: Photos;
  // Null or absent where a resort runs no seasons, as the sim report's does.
  season?: Season | null;
  seasonTally?: SeasonTally;
  seasons?: readonly SeasonReport[];
}

const copyPhotos = (photos: PhotoTally) => ({
  taken: photos.taken,
  spots: photos.spots.map((spot) => ({ ...spot })),
});

// Spread in only when present: an undefined key is not the same as a missing one in a save.
const withPhotos = <T extends { readonly photos?: PhotoTally }>(counts: T) => ({
  ...counts,
  ...(counts.photos ? { photos: copyPhotos(counts.photos) } : {}),
});

const copyReport = (report: DayReport) => ({
  ...withPhotos(report),
  rating: { ...report.rating },
  beds: { ...report.beds },
  money: { ...report.money },
  loudest: report.loudest.map((tally) => ({ ...tally })),
});

const copySeasonal = <T extends SeasonTally | SeasonReport>(record: T) => ({
  ...record,
  money: { ...record.money },
  ...(record.voices ? { voices: record.voices.map((voice) => ({ ...voice })) } : {}),
  ...(record.events ? { events: { ...record.events } } : {}),
  ...(record.topSpot ? { topSpot: { ...record.topSpot } } : {}),
});

export function snapshotResort(state: ResortState): ResortSnapshot {
  return {
    guests: snapshotGuests(state.guests),
    needs: snapshotNeeds(state.needs),
    happiness: snapshotHappiness(state.happiness),
    thoughts: snapshotThoughts(state.thoughts, state.thoughtDay),
    carrying: state.carrying.nodes.slice(),
    litter: state.litter.level.slice(),
    litterWashed: state.litter.washed.slice(),
    upkeep: snapshotUpkeep(state.upkeep, state.venues),
    breakdowns: snapshotBreakdowns(state.breakdowns, state.venues),
    takings: [...state.takings],
    names: [...state.names],
    footfall: { seen: state.footfall.seen.slice(), mood: state.footfall.mood.slice() },
    reviews: state.reviews.map((review) => ({ ...review })),
    today: withPhotos(state.today),
    history: state.history.map(copyReport),
    rating: { ...state.rating },
    ledger: {
      ...state.ledger,
      today: { ...state.ledger.today },
      yesterday: { ...state.ledger.yesterday },
    },
    arrivals: {
      planned: state.arrivalsPlanned,
      admitted: state.arrivalsAdmitted,
      random: state.arrivals.state(),
    },
    open: state.open,
    beds: { ...state.beds },
    hiring: { ...state.hiring },
    staffOff: state.staffOff.slice(),
    prices: { ...state.prices },
    condition: [...state.condition],
    renovating: [...state.renovating],
    closing: [...state.closing],
    zones: state.zones.zone.slice(),
    photos: snapshotPhotos(state.photos),
    ...(state.season ? { season: { ...state.season } } : {}),
    ...(state.season && state.seasonTally ? { seasonTally: copySeasonal(state.seasonTally) } : {}),
    seasons: (state.seasons ?? []).map(copySeasonal),
  };
}

// In the order a load documents; the typed arrays must already have the saved lengths, which
// the save's schema checked against its population. The day is the saved clock's, which places a
// save from before seasons in one.
export function restoreResort(state: ResortState, snapshot: ResortSnapshot, day = 0): void {
  restoreGuests(state.guests, snapshot.guests);
  restoreNeeds(state.needs, snapshot.needs);
  restoreHappiness(state.happiness, snapshot.happiness);
  restoreThoughts(state.thoughts, state.thoughtDay, snapshot.thoughts);
  state.carrying.nodes.set(snapshot.carrying);
  state.litter.level.set(snapshot.litter);
  if (snapshot.litterWashed?.length === state.litter.washed.length) {
    state.litter.washed.set(snapshot.litterWashed);
  } else state.litter.washed.fill(0);
  state.litter.version++;
  state.upkeep = restoreUpkeep(snapshot.upkeep, state.venues);
  state.breakdowns = restoreBreakdowns(snapshot.breakdowns, state.venues);
  state.takings.clear();
  for (const [key, amount] of snapshot.takings) state.takings.set(key, amount);
  state.names = new Map(snapshot.names);
  state.footfall.seen.set(snapshot.footfall.seen);
  state.footfall.mood.set(snapshot.footfall.mood);
  state.reviews = snapshot.reviews.map((review) => ({ ...review }));
  state.today = withPhotos(snapshot.today);
  state.history = snapshot.history.map(copyReport);
  state.rating = { ...snapshot.rating };
  state.ledger = snapshot.ledger;
  state.arrivalsPlanned = snapshot.arrivals.planned;
  state.arrivalsAdmitted = snapshot.arrivals.admitted;
  state.arrivals = resumeRandom(snapshot.arrivals.random);
  state.open = snapshot.open;
  state.beds = { ...snapshot.beds };
  state.hiring = { ...snapshot.hiring };
  state.staffOff = snapshot.staffOff?.slice() ?? new Uint8Array(state.staffOff.length);
  state.prices = { ...snapshot.prices };
  state.condition = snapshot.condition
    ? new Map(snapshot.condition)
    : settledFor([...state.venues, ...state.lodgings].map(({ key }) => key));
  state.renovating = new Map(snapshot.renovating);
  state.closing = new Map(snapshot.closing);
  state.zones.zone.set(snapshot.zones);
  state.zones.version++;
  restorePhotos(state.photos, snapshot.photos);
  if (state.season) {
    state.season = snapshot.season ? { ...snapshot.season } : seasonOfOldSave(day);
    state.seasonTally = snapshot.seasonTally ? copySeasonal(snapshot.seasonTally) : startTally();
  }
  state.seasons = snapshot.seasons.map(copySeasonal);
}
