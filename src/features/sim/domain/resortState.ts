import { restoreGuests, snapshotGuests, type Guests } from '../../guests/domain/guests';
import { resumeRandom, type Random } from '../../layout/domain/random';
import type { Footfall } from '../../overlays/domain/overlays';
import { restoreBreakdowns, snapshotBreakdowns, type Breakdowns } from './breakdowns';
import type { DayCounts, DayReport, PhotoTally } from './dayReport';
import { restoreHappiness, snapshotHappiness, type Happiness } from './happiness';
import type { Ledger } from './ledger';
import { restorePhotos, snapshotPhotos, type Photos } from './photos';
import type { Carrying, Litter } from './litter';
import { restoreNeeds, snapshotNeeds, type Needs } from './needs';
import type { Rating } from './rating';
import type { ResortSnapshot } from './resortSnapshot';
import type { Review } from './reviews';
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
  readonly zones: Zones;
  readonly photos: Photos;
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

export function snapshotResort(state: ResortState): ResortSnapshot {
  return {
    guests: snapshotGuests(state.guests),
    needs: snapshotNeeds(state.needs),
    happiness: snapshotHappiness(state.happiness),
    thoughts: snapshotThoughts(state.thoughts, state.thoughtDay),
    carrying: state.carrying.nodes.slice(),
    litter: state.litter.level.slice(),
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
    zones: state.zones.zone.slice(),
    photos: snapshotPhotos(state.photos),
  };
}

// In the order a load documents; the typed arrays must already have the saved lengths, which
// the save's schema checked against its population.
export function restoreResort(state: ResortState, snapshot: ResortSnapshot): void {
  restoreGuests(state.guests, snapshot.guests);
  restoreNeeds(state.needs, snapshot.needs);
  restoreHappiness(state.happiness, snapshot.happiness);
  restoreThoughts(state.thoughts, state.thoughtDay, snapshot.thoughts);
  state.carrying.nodes.set(snapshot.carrying);
  state.litter.level.set(snapshot.litter);
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
  state.zones.zone.set(snapshot.zones);
  state.zones.version++;
  restorePhotos(state.photos, snapshot.photos);
}
