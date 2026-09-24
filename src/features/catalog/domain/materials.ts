// One DVE material per colour, because the mesher splits its output per material.

export interface MaterialDefinition {
  readonly key: string;
  readonly color: number;
}

export function materialKeyFor(color: number): string {
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error(`Colour ${color} is not a 24-bit RGB integer`);
  }
  return color.toString(16).padStart(6, '0');
}

export const voxelIdFor = (materialKey: string): string => `resort_vox_${materialKey}`;

export const materialIdFor = (materialKey: string): string => `resort_mat_${materialKey}`;

export function materialsForColors(colors: Iterable<number>): MaterialDefinition[] {
  const byKey = new Map<string, MaterialDefinition>();
  for (const color of colors) {
    const key = materialKeyFor(color);
    if (!byKey.has(key)) byKey.set(key, { key, color });
  }
  return [...byKey.values()];
}
