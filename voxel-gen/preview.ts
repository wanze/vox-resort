/**
 * Preview renderer: model -> isometric PNG, dependency-free.
 *
 * A tiny z-buffered software rasteriser plus a from-scratch PNG encoder, so the
 * look of a model can be checked without a browser, a viewer or a GPU. Shading
 * here is for legibility only — the app lights the same voxels itself.
 *
 * Run on Node 22.18+ (native TypeScript type stripping):
 *   node voxel-gen/preview.ts                      # every model
 *   node voxel-gen/preview.ts bungalow             # one or more by id
 *   node voxel-gen/preview.ts voxel-gen/models/oak.ts   # a file, registered or not
 *   node voxel-gen/preview.ts --sheet              # one contact sheet
 *   node voxel-gen/preview.ts --audit              # size table, no rendering
 *   node voxel-gen/preview.ts --people             # the crowd, not the catalogue
 *   node voxel-gen/preview.ts --sea                # the bay's craft, likewise
 *   node voxel-gen/preview.ts --drafts             # models withheld from the app
 *   node voxel-gen/preview.ts --lineup             # every model at one scale, with a person
 *
 * A path renders a model that is not in the registry yet, which is how a
 * candidate is looked at before anyone decides to keep it: registering it would
 * put it in the build palette and oblige the resort plan to stand one somewhere.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { DRAFT_SOURCES, MODEL_SOURCES } from './models/index.ts';
import { PEOPLE_SOURCES } from './people/index.ts';
import { SEA_SOURCES } from './sea/index.ts';
import { SKY_SOURCES } from './sky/index.ts';
import {
  buildModel,
  TILE_VOXELS,
  type Color,
  type PaintedVoxel,
  type VoxelModel,
  type VoxelModelSource,
} from './voxelgen.ts';

type Vec3 = [number, number, number];

interface Triangle {
  readonly p: readonly [Vec3, Vec3, Vec3];
  readonly n: Vec3;
  readonly rgb: Vec3;
}

interface Face {
  readonly n: Vec3;
  readonly d: Vec3;
  readonly c: readonly Vec3[];
}

// Six cube faces: outward normal, neighbour offset (for culling), CCW corners.
const FACES: readonly Face[] = [
  {
    n: [1, 0, 0],
    d: [1, 0, 0],
    c: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    d: [-1, 0, 0],
    c: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    n: [0, 1, 0],
    d: [0, 1, 0],
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    d: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    d: [0, 0, 1],
    c: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, -1],
    d: [0, 0, -1],
    c: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
];

const hexRgb = (hex: Color): Vec3 => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** Culled triangle list: faces shared between two solid voxels are dropped. */
function buildTriangles(model: Pick<VoxelModel, 'voxels'>): Triangle[] {
  const filled = new Set(model.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const triangles: Triangle[] = [];
  for (const voxel of model.voxels) {
    const rgb = hexRgb(voxel.color);
    for (const face of FACES) {
      const neighbour = `${voxel.x + face.d[0]},${voxel.y + face.d[1]},${voxel.z + face.d[2]}`;
      if (filled.has(neighbour)) continue;
      const p = face.c.map((corner): Vec3 => [
        voxel.x + corner[0],
        voxel.y + corner[1],
        voxel.z + corner[2],
      ]);
      triangles.push({ p: [p[0]!, p[1]!, p[2]!], n: face.n, rgb });
      triangles.push({ p: [p[0]!, p[2]!, p[3]!], n: face.n, rgb });
    }
  }
  return triangles;
}

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly depth: Float32Array;
}

const AZIMUTH = 35;
const ELEVATION = 32;
const BACKGROUND: Vec3 = [24, 26, 32];
const LIGHT: Vec3 = (() => {
  const length = Math.hypot(-0.4, 0.85, 0.55);
  return [-0.4 / length, 0.85 / length, 0.55 / length];
})();

const createFramebuffer = (width: number, height: number): Framebuffer => {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = BACKGROUND[0];
    pixels[i * 3 + 1] = BACKGROUND[1];
    pixels[i * 3 + 2] = BACKGROUND[2];
  }
  return { width, height, pixels, depth: new Float32Array(width * height).fill(-Infinity) };
};

/** Rasterises the triangles into `viewport`, fitted to it with a small margin. */
function drawTriangles(fb: Framebuffer, triangles: readonly Triangle[], viewport: Viewport): void {
  const az = (AZIMUTH * Math.PI) / 180;
  const el = (ELEVATION * Math.PI) / 180;
  const [ca, sa, ce, se] = [Math.cos(az), Math.sin(az), Math.cos(el), Math.sin(el)];
  const project = (x: number, y: number, z: number): Vec3 => {
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    return [x1, y * ce - z1 * se, y * se + z1 * ce];
  };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const triangle of triangles) {
    for (const point of triangle.p) {
      const [sx, sy] = project(point[0], point[1], point[2]);
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
  }

  const margin = 0.06;
  const scale = Math.min(
    (viewport.width * (1 - 2 * margin)) / (maxX - minX),
    (viewport.height * (1 - 2 * margin)) / (maxY - minY),
  );
  const ox = viewport.x + (viewport.width - (maxX + minX) * scale) / 2;
  const oy = (viewport.height - (maxY + minY) * scale) / 2;

  const shade = (n: Vec3, rgb: Vec3): Vec3 => {
    const diffuse = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const k = 0.45 + 0.55 * diffuse;
    return [Math.min(255, rgb[0] * k), Math.min(255, rgb[1] * k), Math.min(255, rgb[2] * k)];
  };

  for (const triangle of triangles) {
    const screen = triangle.p.map((point): Vec3 => {
      const [sx, sy, depth] = project(point[0], point[1], point[2]);
      return [sx * scale + ox, viewport.y + viewport.height - (sy * scale + oy), depth];
    });
    const [a, b, c] = screen as [Vec3, Vec3, Vec3];
    const color = shade(triangle.n, triangle.rgb);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;

    const loX = Math.max(viewport.x, Math.floor(Math.min(a[0], b[0], c[0])));
    const hiX = Math.min(viewport.x + viewport.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const loY = Math.max(viewport.y, Math.floor(Math.min(a[1], b[1], c[1])));
    const hiY = Math.min(viewport.y + viewport.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = loY; y <= hiY; y++) {
      for (let x = loX; x <= hiX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const index = y * fb.width + x;
        if (depth <= fb.depth[index]!) continue;
        fb.depth[index] = depth;
        fb.pixels[index * 3] = color[0];
        fb.pixels[index * 3 + 1] = color[1];
        fb.pixels[index * 3 + 2] = color[2];
      }
    }
  }
}

/** Box-downsamples a supersampled framebuffer. */
function downsample(
  fb: Framebuffer,
  factor: number,
): { pixels: Uint8Array; width: number; height: number } {
  const width = Math.floor(fb.width / factor);
  const height = Math.floor(fb.height / factor);
  const pixels = new Uint8Array(width * height * 3);
  const samples = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const index = ((y * factor + sy) * fb.width + (x * factor + sx)) * 3;
          r += fb.pixels[index]!;
          g += fb.pixels[index + 1]!;
          b += fb.pixels[index + 2]!;
        }
      }
      const out = (y * width + x) * 3;
      pixels[out] = r / samples;
      pixels[out + 1] = g / samples;
      pixels[out + 2] = b / samples;
    }
  }
  return { pixels, width, height };
}

function crc32(buffer: Buffer): number {
  let c = ~0;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let i = 0; i < width * 3; i++) raw[y * stride + 1 + i] = rgb[y * width * 3 + i]!;
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const SUPERSAMPLE = 2;

/** Renders one model on its own square canvas. */
function renderModel(model: VoxelModel, size: number): Buffer {
  const fb = createFramebuffer(size * SUPERSAMPLE, size * SUPERSAMPLE);
  drawTriangles(fb, buildTriangles(model), {
    x: 0,
    y: 0,
    width: fb.width,
    height: fb.height,
  });
  const { pixels, width, height } = downsample(fb, SUPERSAMPLE);
  return encodePng(pixels, width, height);
}

/**
 * Renders every model into one grid. Each cell is fitted individually, so the
 * sheet compares shapes and colour, not scale — `--audit` reports the sizes.
 */
function renderSheet(models: readonly VoxelModel[], cell: number, columns: number): Buffer {
  const rows = Math.ceil(models.length / columns);
  const fb = createFramebuffer(columns * cell * SUPERSAMPLE, rows * cell * SUPERSAMPLE);
  models.forEach((model, index) => {
    drawTriangles(fb, buildTriangles(model), {
      x: (index % columns) * cell * SUPERSAMPLE,
      y: Math.floor(index / columns) * cell * SUPERSAMPLE,
      width: cell * SUPERSAMPLE,
      height: cell * SUPERSAMPLE,
    });
  });
  const { pixels, width, height } = downsample(fb, SUPERSAMPLE);
  return encodePng(pixels, width, height);
}

/** How far a lineup row runs before the next model starts a new one, in voxels. */
const LINEUP_ROW = 420;
/** Voxels of clear ground between two models of a lineup. */
const LINEUP_GAP = 14;

/** A model's voxels, moved along the ground by `dx` and `dz`. */
const shifted = (from: VoxelModel, dx: number, dz: number): PaintedVoxel[] =>
  from.voxels.map((voxel) => ({ ...voxel, x: voxel.x + dx, z: voxel.z + dz }));

/** Where each model of a lineup starts: left to right, wrapping into rows. */
function lineupOrigins(models: readonly VoxelModel[]): (readonly [number, number])[] {
  const origins: (readonly [number, number])[] = [];
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  for (const model of models) {
    const wraps = x > 0 && x + model.width > LINEUP_ROW;
    if (wraps) [x, z, rowDepth] = [0, z + rowDepth + LINEUP_GAP, 0];
    origins.push([x, z]);
    x += model.width + LINEUP_GAP;
    rowDepth = Math.max(rowDepth, model.depth);
  }
  return origins;
}

/**
 * Renders models side by side at one scale, each with a person standing at its
 * front-left corner.
 *
 * The sheet fits every cell on its own, so a minigolf course and a litter bin
 * come out the same size there; this is the picture that shows whether two
 * objects are drawn at the same scale as each other and as a 1.75 m figure.
 */
function renderLineup(models: readonly VoxelModel[], person: VoxelModel, size: number): Buffer {
  // Concatenated rather than spread into `push`: the hotel alone is more
  // voxels than a call can take as arguments.
  const voxels = lineupOrigins(models).flatMap(([x, z], index): PaintedVoxel[] => {
    const model = models[index]!;
    return shifted(model, x, z).concat(
      shifted(person, x - person.width - 1, z + model.depth - person.depth),
    );
  });
  const fb = createFramebuffer(size * SUPERSAMPLE, size * SUPERSAMPLE);
  drawTriangles(fb, buildTriangles({ voxels }), { x: 0, y: 0, width: fb.width, height: fb.height });
  const { pixels, width, height } = downsample(fb, SUPERSAMPLE);
  return encodePng(pixels, width, height);
}

/**
 * Reports how well each model fills the tiles it claims. A model far below 100%
 * is drawn at a smaller scale than its neighbours, which is what makes a resort
 * look wrong once everything sits on one grid.
 */
function audit(models: readonly VoxelModel[]): void {
  const rows = models.map((model) => {
    const claimedX = model.tiles.x * TILE_VOXELS;
    const claimedZ = model.tiles.z * TILE_VOXELS;
    const fill = Math.min(model.width / claimedX, model.depth / claimedZ);
    return {
      id: model.id,
      tiles: `${model.tiles.x}x${model.tiles.z}`,
      size: `${model.width}x${model.height}x${model.depth}`,
      claimed: `${claimedX}x${claimedZ}`,
      fill: `${Math.round(fill * 100)}%`,
      voxels: model.voxels.length,
    };
  });
  const width = (key: keyof (typeof rows)[number]): number =>
    Math.max(key.length, ...rows.map((row) => String(row[key]).length));
  const columns = ['id', 'tiles', 'size', 'claimed', 'fill', 'voxels'] as const;
  const line = (cells: readonly string[]): string =>
    cells.map((cell, index) => cell.padEnd(width(columns[index]!))).join('  ');
  console.info(line(columns));
  for (const row of rows.toSorted((a, b) => Number.parseInt(a.fill) - Number.parseInt(b.fill))) {
    console.info(line(columns.map((column) => String(row[column]))));
  }
  console.info(`\ntile edge: ${TILE_VOXELS} voxels`);
}

/**
 * The models the arguments name: ids out of the registry, paths off disk, and
 * the whole registry when nothing is named.
 *
 * A path is how a model that is not registered yet gets looked at; see the
 * note at the top of the file.
 */
async function chooseSources(
  positional: readonly string[],
  registry: readonly VoxelModelSource[],
): Promise<VoxelModelSource[]> {
  const files = positional.filter((arg) => arg.endsWith('.ts'));
  const ids = positional.filter((arg) => !arg.endsWith('.ts'));
  if (!ids.length && !files.length) return [...registry];

  // Ids are looked up across every registry whichever one is the default, so
  // `preview child` works without anyone having to remember the flag.
  const known = [
    ...MODEL_SOURCES,
    ...DRAFT_SOURCES,
    ...PEOPLE_SOURCES,
    ...SKY_SOURCES,
    ...SEA_SOURCES,
  ];
  const missing = ids.filter((id) => !known.some((source) => source.id === id));
  if (missing.length) throw new Error(`Unknown model id(s): ${missing.join(', ')}`);

  const loaded = await Promise.all(
    files.map(async (file): Promise<VoxelModelSource> => {
      const module: { default?: VoxelModelSource } = await import(
        pathToFileURL(path.resolve(process.cwd(), file)).href
      );
      if (!module.default) throw new Error(`${file} has no default-exported model`);
      return module.default;
    }),
  );
  return [...known.filter((source) => ids.includes(source.id)), ...loaded];
}

interface Registry {
  readonly sources: readonly VoxelModelSource[];
  /** What a contact sheet of the registry is called. */
  readonly sheet: string;
  /**
   * Whether a whole-registry run sweeps stale renders afterwards. Not a drafts
   * run, which would otherwise delete the pictures it had just written.
   */
  readonly sweeps: boolean;
}

/**
 * The registries a flag selects. The crowd, the sky and the bay are registries
 * of their own — none of them is part of the catalogue and none of them fills a
 * tile, so none is ever in the default set. See `people/`, `sky/` and `sea/`.
 */
const FLAGGED_REGISTRIES: ReadonlyMap<string, Registry> = new Map([
  ['--people', { sources: PEOPLE_SOURCES, sheet: 'crowd', sweeps: true }],
  ['--sky', { sources: SKY_SOURCES, sheet: 'sky', sweeps: true }],
  ['--sea', { sources: SEA_SOURCES, sheet: 'sea', sweeps: true }],
  ['--drafts', { sources: DRAFT_SOURCES, sheet: 'drafts', sweeps: false }],
]);

const CATALOGUE: Registry = { sources: MODEL_SOURCES, sheet: 'contact-sheet', sweeps: true };

/**
 * Deletes the renders in `outDir` that no registry has a model for.
 *
 * A renamed or removed model, or a sheet from before they moved to `sheets/`,
 * would otherwise sit in `out/` and ship, since the palette's glob emits
 * whatever it matches. What stays is every id in *every* registry rather than
 * what one run wrote: the crowd, the sky and the bay render into the same folder
 * under flags of their own, and a catalogue run must not take their pictures
 * with it.
 *
 * Drafts are the exception, and deliberately: their pictures are swept like a
 * removed model's by any other whole-registry run, because anything left in
 * `out/` ships in the bundle and a draft is not in the app.
 */
function sweepStale(outDir: string): void {
  const known = new Set(
    [...MODEL_SOURCES, ...PEOPLE_SOURCES, ...SKY_SOURCES, ...SEA_SOURCES].map(
      (source) => `${source.id}.png`,
    ),
  );
  // Top level only: `sheets/` is a folder, and the `isFile` filter keeps it.
  const stale = readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.png'))
    .filter((name) => !known.has(name));
  for (const name of stale) {
    rmSync(path.join(outDir, name));
    console.info(`stale -> removed ${name}`);
  }
}

/** The sheet the flags ask for, if any: a contact sheet, or a lineup at one scale. */
function sheetFor(
  args: readonly string[],
  registry: Registry,
  models: readonly VoxelModel[],
): { readonly name: string; readonly png: () => Buffer } | null {
  if (args.includes('--lineup')) {
    const person = buildModel(PEOPLE_SOURCES[0]!);
    return { name: `${registry.sheet}-lineup`, png: () => renderLineup(models, person, 2400) };
  }
  if (args.includes('--sheet')) {
    return { name: registry.sheet, png: () => renderSheet(models, 320, 6) };
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = process.env.VOXELGEN_OUT ?? path.join(here, 'out');
  mkdirSync(outDir, { recursive: true });

  const flag = args.find((arg) => FLAGGED_REGISTRIES.has(arg));
  const registry = (flag && FLAGGED_REGISTRIES.get(flag)) || CATALOGUE;
  const sources = await chooseSources(
    args.filter((arg) => !arg.startsWith('--')),
    registry.sources,
  );
  const models = sources.map((source) => buildModel(source));
  if (args.includes('--audit')) {
    audit(models);
    return;
  }
  const sheet = sheetFor(args, registry, models);
  if (sheet) {
    // Sheets live one level down, because the app's build palette globs
    // `out/*.png` for its thumbnails and a sheet is not a thumbnail — it is a
    // few hundred kilobytes of contact print that would otherwise be emitted
    // into the bundle and never fetched. The glob is not recursive.
    const sheetDir = path.join(outDir, 'sheets');
    mkdirSync(sheetDir, { recursive: true });
    const file = path.join(sheetDir, `${sheet.name}.png`);
    writeFileSync(file, sheet.png());
    console.info(`sheet -> ${file} (${models.length} models)`);
    return;
  }
  for (const model of models) {
    const file = path.join(outDir, `${model.id}.png`);
    writeFileSync(file, renderModel(model, 700));
    console.info(
      `${model.id}: ${model.width}x${model.height}x${model.depth} voxels=${model.voxels.length} -> ${file}`,
    );
  }
  // Only a run over a whole registry sweeps, so naming a few ids never deletes
  // anything.
  if (registry.sweeps && args.every((arg) => arg.startsWith('--'))) sweepStale(outDir);
}

await main();
