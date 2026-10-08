export const tileKey = (x: number, z: number): string => `${x},${z}`;

export function pavedLookup(
  tiles: readonly { readonly x: number; readonly z: number }[],
): (tileX: number, tileZ: number) => boolean {
  const keys = new Set(tiles.map((tile) => tileKey(tile.x, tile.z)));
  return (tileX, tileZ) => keys.has(tileKey(tileX, tileZ));
}
