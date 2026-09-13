/**
 * The isometric preview rendered for every model, as a URL the HUD can show.
 *
 * The pictures are the ones `voxel-gen/preview.ts` writes into `voxel-gen/out/`,
 * so the palette shows exactly the object the scene will build — same voxels,
 * same palette, same authoring pass. Nothing here knows the catalogue: the glob
 * takes whatever is in the folder and files it under the model id its name
 * carries, which is the same id `OBJECT_TYPES` uses. A new model therefore turns
 * up in the palette with its picture as soon as the previews are rendered, and
 * this module is never edited.
 *
 * In `adapters/` because `import.meta.glob` is the bundler's asset pipeline:
 * these are hashed URLs emitted at build time, not values a pure function could
 * compute.
 */

/**
 * Eager because the URLs are strings; the images themselves load on demand.
 *
 * Not recursive, and that is load-bearing: `voxel-gen/preview.ts` writes its
 * contact sheets to `out/sheets/` precisely so this glob does not match them.
 * Anything this matches is emitted into the bundle whether the palette asks for
 * it or not.
 */
const FILES = import.meta.glob<string>('../../../../voxel-gen/out/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** `.../voxel-gen/out/beach-club.png` -> `beach-club`. */
const idOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.png'.length);

const BY_ID: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [idOf(path), url]),
);

/**
 * The preview for a model, or null when there is none.
 *
 * Null is a real answer rather than a broken build: `voxel-gen/out/` is
 * generated and git-ignored, so a clone that has not run `pnpm preview` yet has
 * no pictures at all. The palette falls back to the type's swatch colour, which
 * still says which object is which.
 */
export function previewUrl(modelId: string): string | null {
  return BY_ID.get(modelId) ?? null;
}
