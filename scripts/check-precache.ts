import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MUSIC_CACHE, STREAMED_MUSIC } from '../src/features/pwa/domain/precacheRules.ts';

const DIST = 'dist';
// _headers is read by Cloudflare at deploy time and never served.
const NOT_PRECACHED = /^(sw\.js|workbox-[^/]*\.js|_headers)$|\.map$/;
// Without them the manifest points at nothing and the browser will not offer to install.
const REQUIRED = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

const built = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) =>
    path.relative(DIST, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
  )
  .filter((file) => !NOT_PRECACHED.test(file));

const worker = readFileSync(path.join(DIST, 'sw.js'), 'utf8');
const inManifest = (file: string): boolean => worker.includes(`"${file}"`);
const streamed = built.filter((file) => STREAMED_MUSIC.test(file));
const precached = built.filter((file) => !STREAMED_MUSIC.test(file));
const problems = [
  ...REQUIRED.filter((file) => !built.includes(file)).map((file) => `missing from dist: ${file}`),
  ...precached.filter((file) => !inManifest(file)).map((file) => `not precached: ${file}`),
  ...streamed
    .filter(inManifest)
    .map((file) => `precached, but music is cached once heard: ${file}`),
  ...(streamed.length && !worker.includes(MUSIC_CACHE) ? [`no ${MUSIC_CACHE} route in sw.js`] : []),
];

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.info(`precache: ${precached.length} files, ${streamed.length} music cached once heard`);
