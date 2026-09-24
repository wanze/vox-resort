export type HousingStyle = 'blocks' | 'mixed';

export const HOUSING_STYLES: readonly HousingStyle[] = ['blocks', 'mixed'];

export type BeachPreset = 'auto' | 'quiet' | 'busy' | 'packed';

export const BEACH_PRESETS: readonly BeachPreset[] = ['auto', 'quiet', 'busy', 'packed'];

const BEACH_DENSITY: { readonly [preset in Exclude<BeachPreset, 'auto'>]: number } = {
  quiet: 0.35,
  busy: 0.7,
  packed: 1,
};

export interface ResortConfig {
  readonly parkShare: number;
  readonly housing: HousingStyle;
  readonly villaShare: number;
  readonly beach: BeachPreset;
  readonly streetTrees: boolean;
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

// Clamps rather than throws: these values come straight off HUD controls.
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

export function sameConfig(a?: Partial<ResortConfig>, b?: Partial<ResortConfig>): boolean {
  const left = clampConfig(a);
  const right = clampConfig(b);
  return (Object.keys(left) as (keyof ResortConfig)[]).every((key) => left[key] === right[key]);
}

export function beachDensityOf(preset: BeachPreset, density: number): number {
  return preset === 'auto' ? density : BEACH_DENSITY[preset];
}
