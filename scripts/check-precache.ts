import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
const problems = [
  ...REQUIRED.filter((file) => !built.includes(file)).map((file) => `missing from dist: ${file}`),
  ...built.filter((file) => !worker.includes(`"${file}"`)).map((file) => `not precached: ${file}`),
];

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.info(`precache: ${built.length} files`);
