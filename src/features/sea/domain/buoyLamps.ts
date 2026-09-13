/**
 * Where the buoys' lamps burn, as far as the lamp bake is concerned.
 *
 * Nothing afloat reaches the bake, because the bake is static and a boat is not
 * — but a buoy is the exception that proves it. It is moored: the flotilla never
 * moves it off its mooring, and all the swell does is lift it a fraction of a
 * voxel and heel it a few degrees. At the bake's four-voxel cells that is no
 * motion at all, so a buoy's lamp is baked at its mooring exactly as a street
 * lamp is at its post, and costs the frame nothing.
 *
 * A buoy is drawn hung on its own middle and on its waterline — see `hangOf` in
 * `rendering/adapters/movingField.ts` — so the site this hands the bake is the
 * corner that puts the model's lights back where the geometry puts its lamp.
 * Its heading is ignored: a buoy's lamp is on its mast, and a mast does not move
 * when the buoy turns about it.
 */

import type { LightSite } from '../../lighting/domain/lightAnchors';
import type { Mooring } from './swimArea';

/** How big the buoy model is, which is all the hang is measured from. */
export interface BuoyExtent {
  readonly width: number;
  readonly depth: number;
}

/** One site per mooring, keyed so no placement on the plot can share a key. */
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
