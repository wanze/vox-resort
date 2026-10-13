import { fnv, mix, unitOf } from '../../random/domain/hash';

// By placement key, as the names are: a lodging is no venue, so it has no slot in the upkeep.
export type Condition = ReadonlyMap<string, number>;

// An old save's resort has been open a while: as new would hand every player a free renovation.
// Spread by key, so its buildings do not all come due in the same week.
export const SETTLED = { min: 0.65, max: 0.9 } as const;

export type ConditionBand = 'good' | 'worn' | 'shabby' | 'run-down';

// A lodging waits, closed to new guests, for those still staying; then the work takes its hours.
// A new building is shut while it goes up.
export type Works =
  | { readonly kind: 'closing'; readonly staying: number }
  | { readonly kind: 'renovating'; readonly from: number; readonly until: number }
  | { readonly kind: 'building'; readonly from: number; readonly until: number };

// What a pin over the roof says: a building, where it stands, and the works there.
export interface WorksPin {
  readonly key: string;
  readonly label: string;
  readonly at: { readonly tileX: number; readonly tileZ: number };
  readonly works: Works;
}

const GOOD_FROM = 0.75;

const WORN_FROM = 0.5;

const SHABBY_FROM = 0.25;

// A full building goes from new to shabby in about two seasons, an idle one in about ten.
const AGE_PER_DAY = 0.002;

const USE_PER_DAY = 0.009;

// The resort's waking day: nobody visits a venue in the night, so a full one is full by day.
const DAY_SECONDS = 12 * 3600;

// On the reference resort the median venue is occupied 6 % of the waking day and the busiest
// 66 %; measured against 100 %, every venue would wear at the pace of age alone.
const FULL_OCCUPANCY = 0.25;

// One building of a kind outlasts another; without it, a row of full bungalows comes due at once.
const DURABILITY = { min: 0.8, max: 1.2 } as const;

const DURABILITY_SALT = 0x2f6b_1d93;

const SETTLED_SALT = 0x5c1e_a7f1;

// A run-down lodging still lets its beds; it is worth less a night, not nothing.
const RATE_FLOOR = 0.7;

// With chooseVenue's dirt floor of 0.25, a clean, run-down venue scores 0.7 of a new one.
const APPEAL_FLOOR = 0.6;

// A run-down slide breaks two and a half times as often.
const RELIABILITY_FLOOR = 0.4;

// A run-down building costs two and a half times as much to keep up.
const UPKEEP_RISE = 1.5;

// The line FILTHY_BELOW draws for dirt: a guest minds wear as late as they mind a mess.
export const SHABBY_BELOW = 0.4;

// A dent a twentieth deep, gone within the hour: the guest only had to walk further.
export const DETOUR_UPSET = 0.05;

// From run-down, half the build price: dearer than keeping up, cheaper than building anew.
const RENOVATION_SHARE = 0.5;

const LEAST_RENOVATION = 10;

// A building this good would be renovated for a handful of coins and no difference.
const RENOVATE_BELOW = 0.95;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function conditionOf(condition: Condition, key: string): number {
  return condition.get(key) ?? 1;
}

export function bandOf(level: number): ConditionBand {
  if (level >= GOOD_FROM) return 'good';
  if (level >= WORN_FROM) return 'worn';
  return level >= SHABBY_FROM ? 'shabby' : 'run-down';
}

export function venueBusy(
  visits: number,
  capacity: number,
  dwellSeconds: { readonly min: number; readonly max: number },
): number {
  const meanDwell = (dwellSeconds.min + dwellSeconds.max) / 2;
  if (capacity <= 0 || meanDwell <= 0) return 0;
  const occupancy = visits / ((capacity * DAY_SECONDS) / meanDwell);
  return clamp01(occupancy / FULL_OCCUPANCY);
}

export function lodgingBusy(taken: number, beds: number): number {
  return beds > 0 ? clamp01(taken / beds) : 0;
}

export function wearOf(busy: number): number {
  return AGE_PER_DAY + USE_PER_DAY * clamp01(busy);
}

const unitFor = (key: string, salt: number): number => unitOf(mix(fnv(key) ^ salt));

// Hashed from the key, so a building keeps its durability through a save and an edit.
export function durabilityOf(key: string): number {
  return DURABILITY.min + (DURABILITY.max - DURABILITY.min) * unitFor(key, DURABILITY_SALT);
}

export function aged(condition: Condition, wearByKey: ReadonlyMap<string, number>): Condition {
  const next = new Map(condition);
  for (const [key, wear] of wearByKey) {
    next.set(key, Math.max(0, conditionOf(condition, key) - wear));
  }
  return next;
}

export function rateFactor(level: number): number {
  return RATE_FLOOR + (1 - RATE_FLOOR) * clamp01(level);
}

export function appealFactor(level: number): number {
  return APPEAL_FLOOR + (1 - APPEAL_FLOOR) * clamp01(level);
}

export function reliabilityFactor(level: number): number {
  return RELIABILITY_FLOOR + (1 - RELIABILITY_FLOOR) * clamp01(level);
}

export function upkeepFactor(level: number): number {
  return 1 + UPKEEP_RISE * (1 - clamp01(level));
}

export function isShabby(level: number): boolean {
  return level < SHABBY_BELOW;
}

export function renovationCost(buildCost: number, level: number): number {
  const cost = Math.round(buildCost * RENOVATION_SHARE * (1 - clamp01(level)));
  return Math.max(LEAST_RENOVATION, cost);
}

export function canRenovate(level: number): boolean {
  return level < RENOVATE_BELOW;
}

export function renovated(condition: Condition, key: string): Condition {
  return new Map(condition).set(key, 1);
}

// A demolished building forgets its wear, so one built on its lot later is new.
export function keptFor(condition: Condition, keys: readonly string[]): Condition {
  const standing = new Set(keys);
  return new Map([...condition].filter(([key]) => standing.has(key)));
}

export function settledFor(keys: readonly string[]): Condition {
  const { min, max } = SETTLED;
  return new Map(keys.map((key) => [key, min + (max - min) * unitFor(key, SETTLED_SALT)]));
}
