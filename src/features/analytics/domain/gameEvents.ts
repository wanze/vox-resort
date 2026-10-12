import type { EventDraft } from './analyticsEvent';
import type { ShowcaseStats, StatusView } from '../../hud/domain/views';
import type { LandView } from '../../land/domain/landRights';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import type { Ledger } from '../../sim/domain/ledger';

export type GameSource = 'new' | 'save' | 'shared';

type Stats = Pick<
  ShowcaseStats,
  'backend' | 'objectCount' | 'pathCount' | 'rating' | 'startupMs'
> & {
  readonly guests: Pick<ShowcaseStats['guests'], 'present'>;
  readonly staff: Pick<ShowcaseStats['staff'], 'total'>;
};

// What the HUD knows, narrowed to what is sent.
interface Facts {
  readonly stats: Stats | null;
  readonly ledger: Pick<Ledger, 'mode' | 'balance'> | null;
  readonly land: Pick<LandView, 'owned'> | null;
  readonly status: Pick<StatusView, 'day'> | null;
}

const rendererOf = (facts: Facts): Pick<EventDraft, 'renderer'> =>
  facts.stats ? { renderer: facts.stats.backend } : {};

const modeOf = (facts: Facts): Pick<EventDraft, 'mode'> =>
  facts.ledger ? { mode: facts.ledger.mode } : {};

export function startedOf(
  source: GameSource,
  facts: Facts,
  params: ResortParams | null,
): EventDraft {
  return {
    name: 'game_started',
    source,
    ...rendererOf(facts),
    ...modeOf(facts),
    ...(params ? { tiles: params.tilesX * params.tilesZ } : {}),
  };
}

// Sent each time the page is hidden: visibleMs since the last one sums to the time played, and
// the newest per session is the resort's size when the player left.
export function playedOf(facts: Facts, visibleMs: number): EventDraft {
  const { stats, ledger, land, status } = facts;
  return {
    name: 'played',
    visibleMs: Math.round(visibleMs),
    ...rendererOf(facts),
    ...modeOf(facts),
    ...(stats
      ? {
          objects: stats.objectCount,
          paths: stats.pathCount,
          guests: stats.guests.present,
          staff: stats.staff.total,
          rating: stats.rating,
          startupMs: Math.round(stats.startupMs),
        }
      : {}),
    ...(ledger?.mode === 'tycoon' ? { balance: Math.round(ledger.balance) } : {}),
    ...(land ? { land: land.owned } : {}),
    ...(status ? { day: status.day } : {}),
  };
}
