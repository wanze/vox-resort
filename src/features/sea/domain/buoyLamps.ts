// Baked at the mooring like a street lamp: the swell moves a buoy less than one bake cell.

import type { LightSite } from '../../lighting/domain/lightAnchors';
import type { Mooring } from './swimArea';

export interface BuoyExtent {
  readonly width: number;
  readonly depth: number;
}

export function buoyLampSites(
  moorings: readonly Mooring[],
  buoy: BuoyExtent,
  waterline: number,
): LightSite[] {
  return moorings.map((mooring, index) => ({
    key: `mooring:${index}`,
    x: mooring.x - buoy.width / 2,
    y: waterline,
    z: mooring.z - buoy.depth / 2,
  }));
}
