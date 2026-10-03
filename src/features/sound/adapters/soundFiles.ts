// A URL import, so Vite emits each file hashed into dist/assets, where the precache finds it.
const FILES = import.meta.glob<string>('../../../../sounds/files/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const SOUND_URLS: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);
