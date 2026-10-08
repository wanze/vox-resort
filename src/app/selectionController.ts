import { namesOf, objectTypeById } from '../features/catalog/domain/objectTypes';
import type { Placement } from '../features/layout/domain/resortLayout';
import { cleanliness, NEEDS_CLEANING } from '../features/sim/domain/upkeep';
import { isBroken } from '../features/sim/domain/breakdowns';
import { latestOf } from '../features/sim/domain/thoughts';
import { sceneryOver } from '../features/sim/domain/scenery';
import type { ResortClock } from '../features/sim/domain/resortClock';
import type { StaffRole } from '../features/sim/domain/staff';
import { takingsOf } from '../features/sim/domain/takings';
import {
  createStaffTask,
  SPELLS_PER_LOAD,
  type Order,
  type OrderRole,
  type StaffRouter,
} from '../features/sim/domain/staffRouter';
import { NO_ZONE } from '../features/sim/domain/zones';
import { isNamed, type Venue } from '../features/sim/domain/venues';
import { venueIndexOf } from '../features/resort-sim/domain/visits';
import { nextAt } from '../features/events/domain/programmeView';
import { SHOWN } from '../features/choreography/domain/casting';
import {
  activityLine,
  errandOf,
  guestView,
  personOf,
  placementKeyOf,
  placeView,
  sendOffers,
  staffLine,
  staffView,
  workerOf,
  type Errand,
  type InspectTarget,
  type LifeguardWatch,
  type PlaceView,
  type SelectionView,
  type SendFacts,
} from '../features/inspect/domain/selection';
import type { OrderSpot } from '../features/hud/domain/markers';
import { taskFactsOf, writeDrawn } from '../features/hud/adapters/staffPinner';
import type { Resort } from './showcase';

function lifeguardAt(router: StaffRouter, venue: number): LifeguardWatch {
  if (router.watching(venue)) return 'watching';
  return router.guarded(venue) ? 'coming' : 'nobody';
}

// A venue goes by its name, which the type's label in the view gives way to.
const withNaming = (view: PlaceView, venue: Venue | undefined): PlaceView =>
  venue === undefined
    ? view
    : {
        ...view,
        label: venue.label,
        naming: {
          kind: venue.kind ?? venue.label,
          named: isNamed(venue),
          suggested: namesOf(venue.id).length > 0,
        },
      };

// Only a stage has a programme to show.
const withProgramme = (resort: Resort, view: PlaceView, venue: number, now: number): PlaceView =>
  resort.venues[venue]?.stage === true
    ? { ...view, programme: { next: nextAt(resort.events.programme, view.key, now) } }
    : view;

// Only a venue can be sent to; a fixture or a lodging has nothing for a mechanic or a cleaner.
const withSends = (resort: Resort, view: PlaceView, venue: number): PlaceView =>
  venue < 0 ? view : { ...view, send: sendOffers(sendFactsOf(resort, venue)) };

const onDutyAs = (resort: Resort, role: StaffRole): number =>
  resort.staffPool.role.filter((each, worker) => each === role && resort.duty[worker] === 1).length;

function sendFactsOf(resort: Resort, venue: number): SendFacts {
  const sent = (role: OrderRole): boolean =>
    resort.staffRouter.ordersOf().some((order) => order.role === role && order.venue === venue);
  return {
    broken: isBroken(resort.breakdowns, venue),
    dirty: cleanliness(resort.upkeep, venue) < NEEDS_CLEANING,
    onDuty: { mechanic: onDutyAs(resort, 'mechanic'), cleaner: onDutyAs(resort, 'cleaner') },
    sent: { mechanic: sent('mechanic'), cleaner: sent('cleaner') },
  };
}

// Where advice and markers name it: a venue by its origin tile.
function orderSpotsOf(resort: Resort, orders: readonly Order[]): readonly OrderSpot[] {
  const { tilesX } = resort.litter;
  return orders.flatMap((order) => {
    const venue = resort.venues[order.venue];
    if (venue) return [{ role: order.role, tileX: venue.tileX, tileZ: venue.tileZ }];
    if (order.tile < 0) return [];
    return [
      { role: order.role, tileX: order.tile % tilesX, tileZ: Math.floor(order.tile / tilesX) },
    ];
  });
}

const shiftChanged = (view: SelectionView | null, working: boolean): boolean =>
  view?.kind === 'staff' && view.onDuty !== working;

interface SelectionParts {
  readonly resort: () => Resort;
  readonly clock: Pick<ResortClock, 'day' | 'ticks'>;
  readonly placementOf: (key: string) => Placement | undefined;
  readonly onSelectionChange: (view: SelectionView | null) => void;
  readonly onOrdersChange: (orders: readonly OrderSpot[]) => void;
}

export interface SelectionController {
  select(target: InspectTarget): void;
  // Words the open panel again, for a day, an edit or an order that changed it under the player.
  reword(): void;
  target(): InspectTarget;
  inspectLine(): string | null;
  tellOrders(): void;
}

export function createSelectionController(parts: SelectionParts): SelectionController {
  const { resort: current, clock, placementOf, onSelectionChange, onOrdersChange } = parts;

  // The index, not the view: the view is rebuilt on a new day or an edit, and the live line needs
  // the index.
  let selected: InspectTarget = null;
  let selectedOn = clock.day;

  const guestAt = (person: number): SelectionView => {
    const { guests, needs, happiness, venues, crowd, thoughts, cast } = current();
    // Where they are drawn; somebody hidden indoors is where the crowd holds them, in the venue.
    const drawn = cast.shown[person] === SHOWN.placed ? cast : crowd.crowd;
    const at = { x: drawn.x[person] ?? 0, z: drawn.z[person] ?? 0 };
    const thought = latestOf(thoughts, person);
    return guestView(guests, needs, happiness, venues, person, clock.day, at, thought, thoughts);
  };

  const workerAt = (worker: number): SelectionView | null => {
    const { staffPool: pool, zoneOf, duty } = current();
    if (worker < 0 || worker >= pool.count) return null;
    return staffView(pool.role, worker, zoneOf[worker] ?? NO_ZONE, duty[worker] === 1);
  };

  const somebodyAt = (target: { readonly person: number } | { readonly worker: number }) =>
    'person' in target ? guestAt(target.person) : workerAt(target.worker);

  const viewOf = (target: InspectTarget): SelectionView | null => {
    if (!target) return null;
    if (!('key' in target)) return somebodyAt(target);
    const placement = placementOf(target.key);
    if (!placement) return null;
    const resort = current();
    const { guests, router } = resort;
    // By key: the venue list is the router's numbering; -1 reads as spotless.
    const venue = venueIndexOf(resort, placement.key);
    const view = placeView(
      placement,
      objectTypeById(placement.id).label,
      guests,
      router.occupancyOf(placement.key),
      sceneryOver(resort.scenery, placement),
      cleanliness(resort.upkeep, venue),
      takingsOf(resort.takings, placement.key),
      lifeguardAt(resort.staffRouter, venue),
      isBroken(resort.breakdowns, venue),
    );
    const offered = withProgramme(resort, withSends(resort, view, venue), venue, clock.ticks);
    return withNaming(offered, resort.venues[venue]);
  };

  // Kept to tell when a worker's shift has changed under their open panel.
  let selectedView: SelectionView | null = null;

  const select = (target: InspectTarget): void => {
    const view = viewOf(target);
    selected = view ? target : null;
    selectedView = view;
    selectedOn = clock.day;
    onSelectionChange(view);
  };

  // The one place selection wording and router facts meet, so neither imports the other.
  const errandFor = (person: number): Errand => {
    const { router } = current();
    return errandOf({
      visit: router.visitOf(person),
      goal: router.goalOf(person),
      home: router.homewardTo(person),
      asleep: router.isAsleep(person),
      beach: router.stayOf(person),
      checkingIn: router.isArriving(person),
    });
  };

  let toldOrders: readonly Order[] | null = null;

  // The panel of a building an order names says who is on the way, so it is worded again.
  const tellOrders = (): void => {
    const resort = current();
    const orders = resort.staffRouter.ordersOf();
    if (orders === toldOrders) return;
    toldOrders = orders;
    onOrdersChange(orderSpotsOf(resort, orders));
    rewordPlace();
  };

  const rewordPlace = (): void => {
    if (placementKeyOf(selected) !== null) select(selected);
  };

  const workerTask = createStaffTask();
  const workerAtNow = { x: 0, y: 0, z: 0 };

  const workerLine = (worker: number): string => {
    const resort = current();
    if (shiftChanged(selectedView, resort.duty[worker] === 1)) select(selected);
    const task = resort.staffRouter.taskOf(worker, workerTask);
    const at = writeDrawn(resort, worker, workerAtNow);
    return staffLine(taskFactsOf(resort, worker, task), task.load, SPELLS_PER_LOAD, at);
  };

  const inspectLine = (): string | null => {
    if (selected !== null && clock.day !== selectedOn) select(selected);
    const worker = workerOf(selected);
    return worker === null ? guestLine() : workerLine(worker);
  };

  const guestLine = (): string | null => {
    const person = personOf(selected);
    if (person === null) return null;
    const { crowd, needs, guests } = current();
    return activityLine(crowd.crowd, needs, guests, person, errandFor(person));
  };

  return {
    select,
    reword: () => select(selected),
    target: () => selected,
    inspectLine,
    tellOrders,
  };
}
