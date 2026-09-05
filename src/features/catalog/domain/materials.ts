/**
 * Material identity.
 *
 * Models paint with packed `0xRRGGBB` colours, and every distinct colour in the
 * catalogue becomes one DVE voxel and one DVE rendered material — the mesher
 * splits its output per material, so a submesh always carries a single flat
 * colour. Colours stay flat and unlit: the Three.js scene does the shading.
 */

export interface MaterialDefinition {
  /** Stable key derived from the colour, e.g. "c9a86a". */
  readonly key: string;
  /** Flat colour as a 24-bit RGB integer. */
  readonly color: number;
}

/** Material key for a packed colour. */
export function materialKeyFor(color: number): string {
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error(`Colour ${color} is not a 24-bit RGB integer`);
  }
  return color.toString(16).padStart(6, "0");
}

/** DVE voxel id registered for a material. */
export const voxelIdFor = (materialKey: string): string => `resort_vox_${materialKey}`;

/** DVE rendered-material id registered for a material. */
export const materialIdFor = (materialKey: string): string => `resort_mat_${materialKey}`;

/** One material per distinct colour, in first-seen order. */
export function materialsForColors(colors: Iterable<number>): MaterialDefinition[] {
  const byKey = new Map<string, MaterialDefinition>();
  for (const color of colors) {
    const key = materialKeyFor(color);
    if (!byKey.has(key)) byKey.set(key, { key, color });
  }
  return [...byKey.values()];
}
