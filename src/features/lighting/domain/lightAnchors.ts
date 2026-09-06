/**
 * What a lamp on the plot is.
 *
 * Every model that declares a light contributes one anchor per placement, so a
 * resort of a thousand objects yields a few hundred lamps. They are not lights
 * the renderer knows about: `lightGrid.ts` bakes all of them into a volume once,
 * and the shader reads that instead. See there for why.
 */

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
