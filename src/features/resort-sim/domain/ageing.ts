import { familyOf, objectTypeById, signOf, type SignKind } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import type { Guests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import {
  aged,
  canRenovate,
  conditionOf,
  durabilityOf,
  keptFor,
  lodgingBusy,
  renovated,
  renovationCost,
  venueBusy,
  wearOf,
  type RenovationWorks,
} from '../../sim/domain/condition';
import { canAfford, record } from '../../sim/domain/ledger';
import type { Router } from '../../sim/domain/router';
import { TICKS_PER_HOUR } from './simNow';
import type { SimState } from './simState';

// A morning's work: a bar renovated after breakfast is open again for dinner.
export const RENOVATION_TICKS = 6 * TICKS_PER_HOUR;

type Standing = Pick<SimState, 'venues' | 'lodgings'>;

type Works = Pick<SimState, 'condition' | 'renovating' | 'closing'>;

type AgeingState = Standing &
  Pick<SimState, 'ageing' | 'guests' | 'homeOfLodging' | 'today' | 'condition' | 'lastWear'> & {
    readonly router: Pick<Router, 'dayVisits'>;
  };

type RenovatingState = Standing & Works & Pick<SimState, 'ledger' | 'season' | 'guests'>;

const ageingKeysOf = (resort: Standing): string[] => [
  ...resort.venues.map(({ key }) => key),
  ...resort.lodgings.map(({ key }) => key),
];

// By key, as the dirt is: a building that still stands keeps its wear through an edit.
export function carryAgeing(resort: Standing & Works): void {
  const keys = ageingKeysOf(resort);
  resort.condition = keptFor(resort.condition, keys);
  resort.renovating = keptFor(resort.renovating, keys);
  resort.closing = keptFor(resort.closing, keys);
}

function takenPerHome(guests: Guests): Int32Array {
  const taken = new Int32Array(guests.homes.length);
  for (let person = 0; person < guests.count; person++) {
    const home = guests.home[person]!;
    if (guests.present[person] === 1 && home !== NO_HOME) taken[home]!++;
  }
  return taken;
}

function staying(guests: Guests, key: string): number {
  const home = guests.homes.findIndex((each) => each.key === key);
  return home === -1 ? 0 : (takenPerHome(guests)[home] ?? 0);
}

// Before the bill and before the router forgets the day's visits. The first check-in of a resort
// built that morning closes a period nobody played, and wears nothing.
export function ageBuildings(resort: AgeingState, day: number): void {
  if (!resort.ageing || resort.today.from === day) return;
  const wear = dayWear(resort);
  resort.lastWear = wear;
  resort.condition = aged(resort.condition, wear);
}

// Yesterday's wear, run again for each day skipped; before the first check-in, today's use so far.
export function ageDays(resort: AgeingState, days: number): boolean {
  if (!resort.ageing) return false;
  const daily = resort.lastWear.size > 0 ? resort.lastWear : dayWear(resort);
  const wear = new Map([...daily].map(([key, each]) => [key, each * days]));
  resort.condition = aged(resort.condition, wear);
  return true;
}

function dayWear(resort: AgeingState): Map<string, number> {
  const visits = resort.router.dayVisits();
  const wear = new Map<string, number>();
  for (const venue of resort.venues) {
    const busy = venueBusy(visits.get(venue.key) ?? 0, venue.capacity, venue.dwellSeconds);
    wear.set(venue.key, wearOf(busy) * durabilityOf(venue.key));
  }
  const taken = takenPerHome(resort.guests);
  resort.lodgings.forEach((lodging, index) => {
    const home = resort.homeOfLodging[index] ?? NO_HOME;
    const busy = lodgingBusy(home === NO_HOME ? 0 : taken[home]!, lodging.beds);
    wear.set(lodging.key, wearOf(busy) * durabilityOf(lodging.key));
  });
  return wear;
}

// In a break the clock is stopped, so the work is done before anybody comes.
function startWorks(resort: RenovatingState, key: string, ticks: number): void {
  resort.condition = renovated(resort.condition, key);
  if (resort.season?.state === 'break') return;
  resort.renovating = new Map(resort.renovating).set(key, ticks + RENOVATION_TICKS);
}

// Hourly: a renovation over reopens its building, and a lodging closed for one starts on it once
// its last guests have gone.
export function stepRenovations(resort: RenovatingState, ticks: number): void {
  if (resort.renovating.size > 0) {
    resort.renovating = new Map([...resort.renovating].filter(([, until]) => until > ticks));
  }
  for (const key of resort.closing.keys()) {
    if (staying(resort.guests, key) > 0) continue;
    resort.closing = new Map([...resort.closing].filter(([each]) => each !== key));
    startWorks(resort, key, ticks);
  }
}

// What check-in may not give beds in: closed for a renovation, or in the middle of one.
export const closedLodgings = (resort: Works): ReadonlySet<string> =>
  new Set([...resort.closing.keys(), ...resort.renovating.keys()]);

export function shutUntil(resort: Pick<SimState, 'renovating'>, key: string, ticks: number) {
  const until = resort.renovating.get(key);
  return until !== undefined && until > ticks ? until : null;
}

function worksAt(resort: RenovatingState, key: string, ticks: number): RenovationWorks | null {
  if (resort.closing.has(key)) return { kind: 'closing', staying: staying(resort.guests, key) };
  const until = shutUntil(resort, key, ticks);
  return until === null ? null : { kind: 'renovating', from: until - RENOVATION_TICKS, until };
}

export interface RenovationOffer {
  readonly level: number;
  // Null where it is too good to be worth renovating.
  readonly cost: number | null;
  readonly lodging: boolean;
}

export function renovationOf(resort: RenovatingState, key: string): RenovationOffer | null {
  const venue = resort.venues.find((each) => each.key === key);
  const building = venue ?? resort.lodgings.find((each) => each.key === key);
  if (!building) return null;
  const level = conditionOf(resort.condition, key);
  const cost = canRenovate(level) ? renovationCost(buildCostOf(building.id), level) : null;
  return { level, cost, lodging: venue === undefined };
}

// What the inspector shows; null where nothing ages, so a game without ageing shows no row.
export function conditionShown(
  resort: RenovatingState & Pick<SimState, 'ageing'>,
  key: string,
  ticks: number,
) {
  const offer = resort.ageing ? renovationOf(resort, key) : null;
  if (!offer) return null;
  return { level: offer.level, cost: offer.cost, works: worksAt(resort, key, ticks) };
}

export type RenovationOutcome =
  | { readonly kind: 'renovated' | 'closing' | 'refused' }
  | { readonly kind: 'unaffordable'; readonly cost: number };

// Paid at once. A lodging with guests in it takes no more and is renovated once they have left.
export function renovate(resort: RenovatingState, key: string, ticks: number): RenovationOutcome {
  const offer = renovationOf(resort, key);
  if (!offer || offer.cost === null || worksAt(resort, key, ticks) !== null) {
    return { kind: 'refused' };
  }
  if (!canAfford(resort.ledger, offer.cost)) return { kind: 'unaffordable', cost: offer.cost };
  resort.ledger = record(resort.ledger, 'renovate', -offer.cost);
  if (offer.lodging && staying(resort.guests, key) > 0) {
    resort.closing = new Map(resort.closing).set(key, offer.cost);
    return { kind: 'closing' };
  }
  startWorks(resort, key, ticks);
  return { kind: 'renovated' };
}

// Only while it waits for its guests to leave: once the work has started, it is paid for.
export function cancelRenovation(resort: RenovatingState, key: string): boolean {
  const paid = resort.closing.get(key);
  if (paid === undefined) return false;
  resort.ledger = record(resort.ledger, 'renovate', paid);
  resort.closing = new Map([...resort.closing].filter(([each]) => each !== key));
  return true;
}

export interface UpkeepRow {
  readonly key: string;
  readonly id: string;
  readonly sign: SignKind | null;
  // Every style of a family is one kind, as the Prices tab lists them.
  readonly family: string;
  readonly kind: string;
  readonly label: string;
  readonly lodging: boolean;
  readonly at: { readonly tileX: number; readonly tileZ: number };
  readonly level: number;
  readonly cost: number | null;
  readonly works: RenovationWorks | null;
  // Guests sleeping there now; always 0 at a venue.
  readonly staying: number;
}

// Worst first, as the player would work down it; a building under renovation is as new.
export function upkeepRows(
  resort: RenovatingState & Pick<SimState, 'names'>,
  ticks: number,
): readonly UpkeepRow[] {
  const buildings = [...resort.venues, ...resort.lodgings];
  return buildings
    .map((building) => {
      const offer = renovationOf(resort, building.key)!;
      return {
        key: building.key,
        id: building.id,
        sign: signOf(building.id),
        family: familyOf(building.id),
        kind: objectTypeById(familyOf(building.id)).label,
        label: resort.names.get(building.key) ?? building.label,
        lodging: offer.lodging,
        at: { tileX: building.tileX, tileZ: building.tileZ },
        level: offer.level,
        cost: offer.cost,
        works: worksAt(resort, building.key, ticks),
        staying: offer.lodging ? staying(resort.guests, building.key) : 0,
      };
    })
    .toSorted((a, b) => a.level - b.level || a.label.localeCompare(b.label));
}

// 0 while a lodging waits for its guests: nothing has been done yet.
export function worksProgress(works: RenovationWorks | null, ticks: number): number {
  if (works?.kind !== 'renovating') return 0;
  return Math.min(1, Math.max(0, (ticks - works.from) / (works.until - works.from)));
}

// Where a renovation is pending, the advice already has its answer.
export const conditionAdvised = (resort: Works): ReadonlyMap<string, number> =>
  resort.closing.size === 0
    ? resort.condition
    : new Map([...resort.condition].filter(([key]) => !resort.closing.has(key)));
