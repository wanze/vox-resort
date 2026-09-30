import { restoreGuests, snapshotGuests, type Guests } from '../../guests/domain/guests';
import { resumeRandom, type Random } from '../../layout/domain/random';
import type { Footfall } from '../../overlays/domain/overlays';
import { restoreBreakdowns, snapshotBreakdowns, type Breakdowns } from './breakdowns';
import { restoreHappiness, snapshotHappiness, type Happiness } from './happiness';
import type { Ledger } from './ledger';
import type { Carrying, Litter } from './litter';
import { restoreNeeds, snapshotNeeds, type Needs } from './needs';
import type { Rating } from './rating';
import type { ResortSnapshot } from './resortSnapshot';
import type { Review } from './reviews';
import type { VenueTakings } from './takings';
import { restoreThoughts, snapshotThoughts, type Thoughts, type ThoughtTally } from './thoughts';
import { restoreUpkeep, snapshotUpkeep, type Upkeep } from './upkeep';

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
  readonly footfall: Footfall;
  reviews: readonly Review[];
  rating: Rating;
  ledger: Ledger;
  arrivalsPlanned: number;
  arrivalsAdmitted: number;
  arrivals: Random;
  open: boolean;
  beds: { readonly total: number; readonly taken: number };
}

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
    footfall: { seen: state.footfall.seen.slice(), mood: state.footfall.mood.slice() },
    reviews: state.reviews.map((review) => ({ ...review })),
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
  state.footfall.seen.set(snapshot.footfall.seen);
  state.footfall.mood.set(snapshot.footfall.mood);
  state.reviews = snapshot.reviews.map((review) => ({ ...review }));
  state.rating = { ...snapshot.rating };
  state.ledger = snapshot.ledger;
  state.arrivalsPlanned = snapshot.arrivals.planned;
  state.arrivalsAdmitted = snapshot.arrivals.admitted;
  state.arrivals = resumeRandom(snapshot.arrivals.random);
  state.open = snapshot.open;
  state.beds = { ...snapshot.beds };
}
