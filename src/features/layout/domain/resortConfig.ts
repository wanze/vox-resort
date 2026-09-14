/**
 * The generator's advanced settings: the knobs beyond size, density and seed.
 *
 * Every field has a default that grows the resort the generator grew before the
 * field existed, and every field is pulled into range rather than refused, for
 * the reason `clampParams` gives: these come off HUD controls, and a control
 * that throws is not a control.
 */

/**
 * How lodging on the level ground is laid out.
 *
 * - `blocks`: streets of one kind of house in back-to-back rows, with a shop at
 *   the ends of their lanes.
 * - `mixed`: no blocks; lodging is drawn in among everything else.
 */
export type HousingStyle = 'blocks' | 'mixed';

export const HOUSING_STYLES: readonly HousingStyle[] = ['blocks', 'mixed'];

/**
 * How full the beach is. `auto` follows the district density, which is what
 * the beach did before it had a setting of its own.
 */
export type BeachPreset = 'auto' | 'quiet' | 'busy' | 'packed';

export const BEACH_PRESETS: readonly BeachPreset[] = ['auto', 'quiet', 'busy', 'packed'];

/** The density each fixed beach preset stands for. */
const BEACH_DENSITY: { readonly [preset in Exclude<BeachPreset, 'auto'>]: number } = {
  quiet: 0.35,
  busy: 0.7,
  packed: 1,
};

export interface ResortConfig {
  /** Share of the districts with streets all round that become parks. */
  readonly parkShare: number;
  readonly housing: HousingStyle;
  /** Share of the house lots — in blocks and along the hill walks — that become villas. */
  readonly villaShare: number;
  readonly beach: BeachPreset;
  /** Rows of trees along the promenade and the cross streets, instead of hedges. */
  readonly streetTrees: boolean;
  /** A paved square just inside each gate, with a sign post and flower beds. */
  readonly gatePlazas: boolean;
}

export const PARK_SHARE = { min: 0, max: 0.4 } as const;
export const VILLA_SHARE = { min: 0, max: 0.3 } as const;

export const DEFAULT_CONFIG: ResortConfig = {
  parkShare: 0.2,
  housing: 'blocks',
  villaShare: 0.1,
  beach: 'auto',
  streetTrees: false,
  gatePlazas: false,
};

const clampShare = (value: unknown, range: { min: number; max: number }, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, value))
    : fallback;

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.find((option) => option === value) ?? fallback;

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** A whole config in range, with the defaults filling whatever was not asked for. */
export function clampConfig(asked: Partial<ResortConfig> = {}): ResortConfig {
  return {
    parkShare: clampShare(asked.parkShare, PARK_SHARE, DEFAULT_CONFIG.parkShare),
    housing: oneOf(asked.housing, HOUSING_STYLES, DEFAULT_CONFIG.housing),
    villaShare: clampShare(asked.villaShare, VILLA_SHARE, DEFAULT_CONFIG.villaShare),
    beach: oneOf(asked.beach, BEACH_PRESETS, DEFAULT_CONFIG.beach),
    streetTrees: flag(asked.streetTrees, DEFAULT_CONFIG.streetTrees),
    gatePlazas: flag(asked.gatePlazas, DEFAULT_CONFIG.gatePlazas),
  };
}

/** Whether two configs grow the same resort, once both are in range. */
export function sameConfig(a?: Partial<ResortConfig>, b?: Partial<ResortConfig>): boolean {
  const left = clampConfig(a);
  const right = clampConfig(b);
  return (Object.keys(left) as (keyof ResortConfig)[]).every((key) => left[key] === right[key]);
}

/** How built-up the beach is, given its preset and the district density. */
export function beachDensityOf(preset: BeachPreset, density: number): number {
  return preset === 'auto' ? density : BEACH_DENSITY[preset];
}
