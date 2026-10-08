import { objectTypeById } from '../../catalog/domain/objectTypes';
import { levelHeight } from '../../layout/domain/elevation';
import type { Placement } from '../../layout/domain/resortLayout';
import type { Terrain } from '../../layout/domain/terrain';
import type { Plot } from '../../resort-prep/domain/prepareResort';
import type { Depot } from '../../sim/domain/depots';
import type { Lodging } from '../../sim/domain/lodgings';
import type { Staff } from '../../sim/domain/staff';
import {
  createStaffTask,
  STAFF_TASK_KINDS,
  type StaffRouter,
  type StaffTask,
} from '../../sim/domain/staffRouter';
import { isNamed, shelterOf, type Venue } from '../../sim/domain/venues';
import { SHOWN, type Cast } from '../../choreography/domain/casting';
import type { CrowdField } from '../../crowd/adapters/crowdField';
import { pinTitle, staffName, taskWords, type TaskFacts } from '../../inspect/domain/staffWords';
import {
  createPinSpot,
  isPinned,
  roofOver,
  staffPinOf,
  type Anchor,
  type Footprint,
  type Roofs,
} from '../domain/staffPins';
import type { FrameUpdate } from './hudOverlay';
import { createMarkerSpots } from './screenAnchors';

export interface PinnedResort {
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly depots: readonly Depot[];
  readonly plot: Pick<Plot, 'placements'>;
  readonly terrain: Pick<Terrain, 'levelOf'>;
  readonly staffPool: Pick<Staff, 'count' | 'role'>;
  readonly staffRouter: Pick<StaffRouter, 'taskOf'>;
  readonly staff: Pick<CrowdField, 'crowd'>;
  readonly staffCast: Pick<Cast, 'shown' | 'x' | 'y' | 'z'>;
}

const byKey = (placements: readonly Placement[]): ReadonlyMap<string, Placement> =>
  new Map(placements.map((placement) => [placement.key, placement]));

export const groundUnder = (
  resort: Pick<PinnedResort, 'terrain'>,
  place: { readonly tileX: number; readonly tileZ: number },
): number => levelHeight(resort.terrain.levelOf(place.tileX, place.tileZ));

interface RoofsFor {
  readonly venues: readonly Venue[];
  readonly lodgings: readonly Lodging[];
  readonly depots: readonly Depot[];
  readonly roofs: Roofs;
}

const heightOf = (id: string | undefined): number =>
  id === undefined ? 0 : objectTypeById(id).model.height;

// A depot carries no model id, so its height is read off the placement it stands for.
function roofsNow(resort: PinnedResort): Roofs {
  const { venues, lodgings, depots, plot } = resort;
  const over = (place: Footprint, id: string | undefined): Anchor =>
    roofOver(place, groundUnder(resort, place), heightOf(id));
  const placed = byKey(plot.placements);
  return {
    venues: venues.map((venue) => (shelterOf(venue) === 'covered' ? over(venue, venue.id) : null)),
    lodgings: lodgings.map((lodging) => over(lodging, lodging.id)),
    depots: depots.map((depot) => over(depot, placed.get(depot.key)?.id)),
  };
}

// Pinned per worker: slot i is worker i, so a button's role never changes under it.
export function createStaffPinner(capacity: number) {
  const spots = createMarkerSpots(capacity);
  const inside = new Uint8Array(capacity);
  const titles = Array.from({ length: capacity }, () => '');
  // What each title was worded from, so a title is only built again when the task changes.
  const worded = new Float64Array(capacity).fill(-1);
  const task = createStaffTask();
  const spot = createPinSpot();
  const drawn = { x: 0, y: 0, z: 0 };
  let cached: RoofsFor | null = null;

  const roofsOf = (resort: PinnedResort): Roofs => {
    if (cached === null || !roofsStand(cached, resort)) {
      const { venues, lodgings, depots } = resort;
      cached = { venues, lodgings, depots, roofs: roofsNow(resort) };
      // The indices a title was worded from name other buildings now.
      worded.fill(-1);
    }
    return cached.roofs;
  };

  const retitle = (resort: PinnedResort, worker: number): void => {
    const key = titleKey(task);
    if (worded[worker] === key) return;
    worded[worker] = key;
    const words = taskWords(taskFactsOf(resort, worker, task));
    titles[worker] = pinTitle(staffName(resort.staffPool.role, worker), words);
  };

  const pin = (resort: PinnedResort, worker: number, roofs: Roofs): void => {
    resort.staffRouter.taskOf(worker, task);
    const pinned = staffPinOf(task, writeDrawn(resort, worker, drawn), roofs, spot);
    spots.anchor(worker, pinned ? spot : NOWHERE);
    inside[worker] = Number(spot.inside);
    if (pinned) retitle(resort, worker);
  };

  const pinEach = (
    resort: PinnedResort,
    count: number,
    shown: boolean,
    selected: number | null,
  ) => {
    const roofs = roofsOf(resort);
    for (let worker = 0; worker < count; worker++) {
      if (isPinned(worker, shown, selected)) pin(resort, worker, roofs);
      else spots.anchor(worker, NOWHERE);
    }
  };

  return {
    view: Object.assign(spots.view, { inside, titles }) as FrameUpdate['staff'],
    pin(resort: PinnedResort, shown: boolean, selected: number | null): void {
      const count = shown || selected !== null ? Math.min(capacity, resort.staffPool.count) : 0;
      if (count > 0) pinEach(resort, count, shown, selected);
      spots.showing(count);
    },
    project: spots.project,
  };
}

const roofsStand = (cached: RoofsFor, resort: PinnedResort): boolean =>
  cached.venues === resort.venues &&
  cached.lodgings === resort.lodgings &&
  cached.depots === resort.depots;

const titleKey = (task: StaffTask): number => {
  const kind =
    STAFF_TASK_KINDS.indexOf(task.kind) * 4 + Number(task.working) * 2 + Number(task.ordered);
  return (kind * TITLE_SPAN + task.venue + 1) * TITLE_SPAN + task.lodging + 1;
};

const labelOf = (list: readonly { readonly label: string }[], index: number): string | null =>
  list[index]?.label ?? null;

export function taskFactsOf(resort: PinnedResort, worker: number, task: StaffTask): TaskFacts {
  const venue = resort.venues[task.venue];
  return {
    kind: task.kind,
    working: task.working,
    role: resort.staffPool.role[worker]!,
    venue: venue?.label ?? null,
    lodging: labelOf(resort.lodgings, task.lodging),
    ordered: task.ordered,
    named: venue !== undefined && isNamed(venue),
  };
}

const isAway = (resort: PinnedResort, worker: number): boolean =>
  resort.staff.crowd.offPlot[worker] === 1 || resort.staffCast.shown[worker] === SHOWN.hidden;

// Where the worker is drawn, the cast's place or the crowd's; NaN for anybody not on the plot.
export function writeDrawn(
  resort: PinnedResort,
  worker: number,
  into: { x: number; y: number; z: number },
) {
  if (isAway(resort, worker)) return Object.assign(into, NOWHERE);
  const { staffCast } = resort;
  const from = staffCast.shown[worker] === SHOWN.placed ? staffCast : resort.staff.crowd;
  into.x = from.x[worker]!;
  into.y = from.y[worker]!;
  into.z = from.z[worker]!;
  return into;
}

const NOWHERE: Anchor = { x: Number.NaN, y: Number.NaN, z: Number.NaN };

// Wider than any plot's venue or lodging list, so a title key never runs one into the next.
const TITLE_SPAN = 1 << 16;
