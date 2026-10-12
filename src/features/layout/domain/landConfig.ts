export interface LandConfig {
  readonly river: boolean;
  readonly hills: boolean;
  readonly island: boolean;
}

export const DEFAULT_LAND: LandConfig = { river: true, hills: true, island: false };

// A grown resort keeps its plain ground unless asked: each of these costs it building room.
export const GROWN_LAND: LandConfig = { river: false, hills: false, island: false };

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export function clampLand(
  asked: Partial<LandConfig> = {},
  defaults: LandConfig = DEFAULT_LAND,
): LandConfig {
  return {
    river: flag(asked.river, defaults.river),
    hills: flag(asked.hills, defaults.hills),
    island: flag(asked.island, defaults.island),
  };
}

export function landFlagsOf(asked: Partial<LandConfig>): Partial<LandConfig> {
  const flags: { -readonly [flag in keyof LandConfig]?: boolean } = {};
  for (const name of ['river', 'hills', 'island'] as const) {
    const value = asked[name];
    if (typeof value === 'boolean') flags[name] = value;
  }
  return flags;
}
