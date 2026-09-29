export interface LandConfig {
  readonly river: boolean;
  readonly hills: boolean;
  readonly island: boolean;
}

export const DEFAULT_LAND: LandConfig = { river: true, hills: true, island: false };

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export function clampLand(asked: Partial<LandConfig> = {}): LandConfig {
  return {
    river: flag(asked.river, DEFAULT_LAND.river),
    hills: flag(asked.hills, DEFAULT_LAND.hills),
    island: flag(asked.island, DEFAULT_LAND.island),
  };
}
