import { crowdPerBody } from '../../crowd/domain/crowdSnapshot';
import {
  resortPerPerson,
  resortPerThought,
  type ResortSnapshot,
} from '../../sim/domain/resortSnapshot';
import { routerPerPerson, type RouterSnapshot } from '../../sim/domain/routerSnapshot';
import type { CrowdSnapshot } from '../../crowd/domain/crowdSnapshot';
import type { GameSnapshot } from './snapshot';

type Column = ArrayLike<unknown>;

// The guest crowd only: the staff pool is fixed by the caps, so it never grows.
const guestColumnsOf = (game: GameSnapshot): readonly Column[] => [
  ...resortPerPerson(game.resort),
  ...routerPerPerson(game.router),
  ...resortPerThought(game.resort),
  ...crowdPerBody(game.crowd),
];

// Copies, so neither snapshot is written to: either may share arrays with a live resort.
function savedOverFresh(saved: Column, fresh: Column): Column {
  if (ArrayBuffer.isView(fresh) && ArrayBuffer.isView(saved)) {
    const widened = (fresh as unknown as Int32Array).slice();
    widened.set(saved as unknown as Int32Array);
    return widened;
  }
  return [...Array.from(saved), ...Array.from(fresh).slice(saved.length)];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !ArrayBuffer.isView(value);

// Walks the saved game and swaps each guest column for its widened copy, wherever it is nested;
// everything else is the saved game's. The fresh game was built with everybody away, so the new
// bodies at the back are free for check-in and hold no bed the saved homes do not know about.
export function widenGame(saved: GameSnapshot, fresh: GameSnapshot): GameSnapshot {
  const freshColumns = guestColumnsOf(fresh);
  const widened = new Map<unknown, Column>(
    guestColumnsOf(saved).map((column, index) => [
      column,
      savedOverFresh(column, freshColumns[index]!),
    ]),
  );
  const merge = (value: unknown): unknown => {
    const column = widened.get(value);
    if (column) return column;
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, merge(inner)]));
  };
  const resort = merge(saved.resort) as ResortSnapshot;
  return {
    ...saved,
    population: fresh.population,
    resort: { ...resort, guests: { ...resort.guests, count: fresh.resort.guests.count } },
    router: merge(saved.router) as RouterSnapshot,
    crowd: merge(saved.crowd) as CrowdSnapshot,
  };
}
