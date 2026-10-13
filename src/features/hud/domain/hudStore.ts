import type { ProgrammeFacts } from '../../events/domain/programmeView';
import type { FollowView } from '../../guest-view/domain/followRules';
import type { HighlightType } from '../../highlights/domain/highlights';
import type { SelectionView } from '../../inspect/domain/selection';
import type { LandView } from '../../land/domain/landRights';
import type { Advice } from '../../sim/domain/advice';
import type { DayReport } from '../../sim/domain/dayReport';
import type { Ledger } from '../../sim/domain/ledger';
import type { SeasonReport, SeasonView } from '../../sim/domain/season';
import type { Weather } from '../../sim/domain/weather';
import type { OrderSpot } from './markers';
import type { SignSpot } from './signs';
import type { UpkeepRow } from '../../resort-sim/domain/ageing';
import type { WorksPin } from '../../sim/domain/condition';
import type { CameraView, ShowcaseStats, StatusView, VoicesView } from './views';

export interface HudState {
  readonly stats: ShowcaseStats | null;
  readonly camera: CameraView;
  readonly selection: SelectionView | null;
  readonly orders: readonly OrderSpot[];
  readonly signs: readonly SignSpot[];
  // Every lodging and venue, the most worn first, for Books > Upkeep.
  readonly upkeep: readonly UpkeepRow[];
  // Those of them with a renovation pending or under way, one pin each, at most MAX_WORKS.
  readonly works: readonly WorksPin[];
  readonly highlightTypes: readonly HighlightType[];
  // The ticks travel with the list: the news dates what it hears.
  readonly advice: { readonly list: readonly Advice[]; readonly ticks: number };
  readonly status: StatusView | null;
  readonly voices: VoicesView;
  readonly history: readonly DayReport[];
  readonly weather: Weather;
  readonly open: boolean;
  readonly name: string | null;
  // Names the game's newspapers; null until the first resort stands.
  readonly gameId: string | null;
  readonly ledger: Ledger | null;
  readonly land: LandView | null;
  readonly pending: boolean;
  readonly programme: ProgrammeFacts | null;
  readonly following: FollowView | null;
  // The clock is running through a quiet night faster than the speed picked.
  readonly fastNight: boolean;
  // Null where the resort runs no seasons.
  readonly season: SeasonView | null;
  readonly seasons: readonly SeasonReport[];
}

export interface HudStore {
  getSnapshot(): HudState;
  subscribe(listener: () => void): () => void;
  publish(patch: Partial<HudState>): void;
  // Calls `changed` whenever the selected slice is another object.
  watch<T>(select: (state: HudState) => T, changed: (next: T) => void): () => void;
}

export const INITIAL_HUD: HudState = {
  stats: null,
  camera: { mode: 'perspective', direction: 'southeast', detail: true },
  selection: null,
  orders: [],
  signs: [],
  upkeep: [],
  works: [],
  highlightTypes: [],
  advice: { list: [], ticks: 0 },
  status: null,
  voices: { loudest: [], reviews: [], photos: null },
  history: [],
  weather: 'clear',
  open: true,
  name: null,
  gameId: null,
  ledger: null,
  land: null,
  pending: false,
  programme: null,
  following: null,
  fastNight: false,
  season: null,
  seasons: [],
};

// A patch that changes nothing tells nobody: a publish replaces a callback, and must not render
// React more often than the callback did.
export function createHudStore(initial: HudState = INITIAL_HUD): HudStore {
  let state = initial;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getSnapshot: () => state,
    subscribe,
    publish(patch) {
      const keys = Object.keys(patch) as (keyof HudState)[];
      if (keys.every((key) => Object.is(patch[key], state[key]))) return;
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    watch(select, changed) {
      let last = select(state);
      return subscribe(() => {
        const next = select(state);
        if (Object.is(next, last)) return;
        last = next;
        changed(next);
      });
    },
  };
}
