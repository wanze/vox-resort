// Deliberately not recursive: contact sheets live in out/sheets/ so they are
// not emitted into the bundle.
const FILES = import.meta.glob<string>('../../../../voxel-gen/out/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const idOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.png'.length);

const BY_ID: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [idOf(path), url]),
);

// Null is expected: voxel-gen/out/ is git-ignored until `pnpm preview` has run.
export function previewUrl(modelId: string): string | null {
  return BY_ID.get(modelId) ?? null;
}
