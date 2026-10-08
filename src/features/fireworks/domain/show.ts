import { createRandom, type Random } from '../../layout/domain/random';
import { mix } from '../../random/domain/hash';
import type { LaunchSite } from './launch';
import { LONGEST_LIFE, MAX_RISE, STARS, type ShellKind } from './shells';

export type TierId = 'small' | 'medium' | 'grand';

export const SHOW_SECONDS: { readonly [tier in TierId]: number } = {
  small: 60,
  medium: 75,
  grand: 90,
};

const FINALE_SECONDS: { readonly [tier in TierId]: number } = { small: 8, medium: 10, grand: 14 };

const OPENING_SECONDS = 8;
const OPENING_GAP = { min: 1.5, max: 2.5 } as const;
const BODY_GAP = { min: 0.6, max: 1.6 } as const;
const FINALE_GAP = { min: 0.12, max: 0.28 } as const;
const PAIR_CHANCE = 0.18;
const FIRST_LAUNCH = 0.4;

const RISE = { min: 1.6, max: MAX_RISE } as const;
// About 40 to 65 metres up, at the lanterns' four voxels a metre.
const BURST_HEIGHT = { min: 150, max: 260 } as const;
const RADIUS = { min: 40, max: 70 } as const;
const FINALE_RADIUS = { min: 60, max: 110 } as const;
const FINALE_STARS = 1.4;
// So two shells from one site do not burst on top of each other.
const DRIFT_VOXELS = 24;
const WHISTLE_CHANCE = 0.25;

// The tail a launch needs before the show is over: the slowest rise and the longest-lived star.
const TAIL_SECONDS = MAX_RISE + LONGEST_LIFE;

// A run started this many ticks ago, or less, plays from the top rather than mid-show.
const FRESH_TICKS = 2;

const PALETTE: readonly number[] = [0xff3b30, 0xffc642, 0x45e070, 0x4a8cff, 0xb36bff, 0xfff1d6];

const GOLD = 0xffc642;

const MIX: { readonly [tier in TierId]: readonly (readonly [ShellKind, number])[] } = {
  small: [
    ['peony', 0.65],
    ['willow', 0.35],
  ],
  medium: [
    ['peony', 0.4],
    ['willow', 0.25],
    ['crackle', 0.2],
    ['ring', 0.15],
  ],
  grand: [
    ['peony', 0.3],
    ['willow', 0.2],
    ['crackle', 0.28],
    ['ring', 0.22],
  ],
};

// A booking with no size, or one a later version added, plays the middle size.
export function tierIdOf(tier: string | undefined): TierId {
  return tier === 'small' || tier === 'grand' ? tier : 'medium';
}

export interface Shell {
  readonly launchAt: number;
  readonly site: LaunchSite;
  readonly kind: ShellKind;
  readonly colour: number;
  readonly burstX: number;
  readonly burstY: number;
  readonly burstZ: number;
  readonly rise: number;
  readonly radius: number;
  readonly stars: number;
  readonly whistle: boolean;
  readonly seed: number;
}

export interface Show {
  readonly tier: TierId;
  readonly length: number;
  // Sorted by launchAt.
  readonly shells: readonly Shell[];
  readonly finaleFrom: number;
}

export interface ShowPlan {
  readonly tier: TierId;
  readonly seed: number;
  readonly sites: readonly LaunchSite[];
}

const between = (random: Random, range: { readonly min: number; readonly max: number }): number =>
  range.min + random() * (range.max - range.min);

function kindFor(random: Random, tier: TierId): ShellKind {
  let roll = random();
  for (const [kind, share] of MIX[tier]) {
    roll -= share;
    if (roll < 0) return kind;
  }
  return MIX[tier][0]![0];
}

interface Launch {
  readonly at: number;
  readonly site: number;
  readonly kind: ShellKind;
  readonly colour: number;
  readonly finale: boolean;
  // -1 or 1: a mirrored pair drifts apart rather than together.
  readonly side: number;
}

function shellOf(random: Random, launch: Launch, sites: readonly LaunchSite[]): Shell {
  const site = sites[launch.site]!;
  const angle = random() * Math.PI * 2;
  const drift = random() * DRIFT_VOXELS;
  const big = launch.finale ? FINALE_RADIUS : RADIUS;
  return {
    launchAt: launch.at,
    site,
    kind: launch.kind,
    colour: launch.colour,
    burstX: site.x + Math.cos(angle) * drift * launch.side,
    burstY: site.y + between(random, BURST_HEIGHT),
    burstZ: site.z + Math.sin(angle) * drift,
    rise: between(random, RISE),
    radius: between(random, big),
    stars: Math.round(STARS[launch.kind] * (launch.finale ? FINALE_STARS : 1)),
    whistle: random() < WHISTLE_CHANCE,
    seed: Math.floor(random() * 2 ** 31),
  };
}

function colourFor(random: Random, kind: ShellKind): number {
  return kind === 'willow' ? GOLD : PALETTE[Math.floor(random() * PALETTE.length)]!;
}

function gapAt(random: Random, at: number, finaleFrom: number): number {
  if (at < OPENING_SECONDS) return between(random, OPENING_GAP);
  return between(random, at < finaleFrom ? BODY_GAP : FINALE_GAP);
}

// One launch, or a mirrored pair from opposite ends of the beach in the body of the show.
function launchesAt(
  random: Random,
  at: number,
  tier: TierId,
  finaleFrom: number,
  sites: number,
): readonly Launch[] {
  const kind = kindFor(random, tier);
  const colour = colourFor(random, kind);
  const site = Math.floor(random() * sites);
  const finale = at >= finaleFrom;
  const one: Launch = { at, site, kind, colour, finale, side: 1 };
  const body = at >= OPENING_SECONDS && !finale;
  const mirror = sites - 1 - site;
  if (!body || mirror === site || random() >= PAIR_CHANCE) return [one];
  return [one, { ...one, site: mirror, side: -1 }];
}

export function planShow(plan: ShowPlan): Show {
  const { tier, sites } = plan;
  const length = SHOW_SECONDS[tier];
  const closing = length - TAIL_SECONDS;
  const finaleFrom = closing - FINALE_SECONDS[tier];
  if (sites.length === 0) return { tier, length, shells: [], finaleFrom };
  const random = createRandom(plan.seed);
  const launches: Launch[] = [];
  for (let at = FIRST_LAUNCH; at < closing; at += gapAt(random, at, finaleFrom)) {
    launches.push(...launchesAt(random, at, tier, finaleFrom, sites.length));
  }
  for (const [site] of sites.entries()) {
    const colour = colourFor(random, 'ring');
    launches.push({ at: closing, site, kind: 'ring', colour, finale: true, side: 1 });
  }
  const shells = launches.map((launch) => shellOf(random, launch, sites));
  return { tier, length, shells, finaleFrom };
}

// The first shell launched at or after `since`, by a binary search: the shells are sorted.
export function firstLaunchedFrom(shells: readonly Shell[], since: number): number {
  let low = 0;
  let high = shells.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (shells[middle]!.launchAt < since) low = middle + 1;
    else high = middle;
  }
  return low;
}

const BENCH_SEED = 76;

// Seconds after the closing rings go up: they have just burst, with the finale still in the air.
const BENCH_PEAK_AFTER = 2.5;

// Started so that `seconds` of playing end at the busiest moment of the finale, for a bench.
export function benchShow(
  tier: TierId,
  sites: readonly LaunchSite[],
  seconds: number,
): { readonly show: Show; readonly from: number } {
  const show = planShow({ tier, seed: BENCH_SEED, sites });
  const peak = (show.shells.at(-1)?.launchAt ?? 0) + BENCH_PEAK_AFTER;
  return { show, from: Math.max(0, peak - seconds) };
}

export function showSeed(occurrence: { readonly booking: number; readonly day: number }): number {
  return mix(
    Math.imul(occurrence.booking + 1, 0x85eb_ca6b) ^ Math.imul(occurrence.day, 0xc2b2_ae35),
  );
}

export function playheadFor(
  occurrence: { readonly start: number; readonly end: number },
  now: number,
  length: number,
): number {
  if (now - occurrence.start <= FRESH_TICKS) return 0;
  const through = (now - occurrence.start) / (occurrence.end - occurrence.start);
  return Math.min(1, Math.max(0, through)) * length;
}
