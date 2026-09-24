import type { ModelLight } from '../../../../voxel-gen/voxelgen.ts';
import type { GridReservation } from './lightGrid';

export interface LightAnchor {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: number;
  readonly intensity: number;
  // In voxels.
  readonly distance: number;
}

export interface LightSite {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

// Numbered within the placement rather than across the plot, so adding a lamp does not rename the
// others and a later removal still matches its key.
export function anchorsFor(site: LightSite, lights: readonly ModelLight[]): LightAnchor[] {
  return lights.map((light, index) => ({
    key: `${site.key}:${index}`,
    x: site.x + light.x,
    y: site.y + light.y,
    z: site.z + light.z,
    color: light.color,
    intensity: light.intensity,
    distance: light.distance,
  }));
}

export interface Ground {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

// The whole plot is reserved so a lamp placed anywhere on the resort lights; beyond it nothing is.
export function lampReservationFor(
  ground: Ground,
  lights: readonly ModelLight[],
): GridReservation | null {
  if (lights.length === 0) return null;
  let reach = 0;
  let ceiling = 0;
  for (const light of lights) {
    reach = Math.max(reach, light.distance);
    ceiling = Math.max(ceiling, light.y);
  }
  return {
    minX: ground.minX - reach,
    maxX: ground.maxX + reach,
    minZ: ground.minZ - reach,
    maxZ: ground.maxZ + reach,
    minY: 0,
    maxY: ceiling + reach,
  };
}
