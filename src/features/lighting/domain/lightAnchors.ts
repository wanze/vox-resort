/**
 * What a lamp on the plot is, where the plot's lamps come from, and how much
 * room to leave for the ones that are not there yet.
 *
 * Every model that declares a light contributes one anchor per placement, so a
 * resort of a thousand objects yields a few hundred lamps. They are not lights
 * the renderer knows about: `lightGrid.ts` bakes all of them into a volume, and
 * the shader reads that instead. See there for why.
 */

import type { ModelLight } from '../../../../voxel-gen/voxelgen.ts';
import type { GridReservation } from './lightGrid';

export interface LightAnchor {
  /** Placement key the light belongs to, unique across the resort. */
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: number;
  /** Intensity at full strength, before the day/night factor. */
  readonly intensity: number;
  /** Falloff distance in voxels. */
  readonly distance: number;
}

/** Where an object stands, as far as its lights are concerned. */
export interface LightSite {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  /** Height the object stands at: the surface of the terrace it is on. */
  readonly y: number;
}

/**
 * The anchors one placement contributes.
 *
 * Numbered within the placement that owns them rather than across the plot: a
 * running count would rename every lamp behind the one that was just added, and
 * the keys are what a later removal has to match on.
 *
 * The y coordinate is the model's own, measured off the ground the post is
 * planted in: a light declared eighteen voxels up a lamp post is eighteen voxels
 * above whichever terrace that post stands on.
 */
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

/** The ground a lamp might later be stood on, in voxels. */
export interface Ground {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Room in the grid for lamps not placed yet: anywhere on the plot, plus the
 * furthest any model's light reaches beyond the plot's edge.
 *
 * The grid is otherwise sized to the lamps standing at load, which on this
 * resort already covers most of the plot — the lamps are scattered along every
 * path — but "most" is not a rule anyone can build against. Reserving the plot
 * outright is what turns "a lamp placed here happens to light" into "a lamp
 * placed anywhere on the resort lights", and on this plot it adds 0.65 MB to the
 * 42.9 MB the grid already takes and does not coarsen the cells.
 *
 * Beyond that box, nothing is reserved. The pointer can drop an object on any
 * tile the camera can see, including tiles far off the plot, and a grid sized to
 * the whole visible ground plane is not a grid anyone can afford. A lamp out
 * there lights whatever part of the grid it still reaches and nothing else; the
 * HUD says how many lamps that has happened to.
 *
 * Null when no model in the catalogue declares a light at all, which is the one
 * case where there is nothing to reserve for.
 */
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
