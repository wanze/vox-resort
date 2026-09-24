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

const LINEUP_ROW = 420;
const LINEUP_GAP = 14;

const shifted = (from: VoxelModel, dx: number, dz: number): PaintedVoxel[] =>
  from.voxels.map((voxel) => ({ ...voxel, x: voxel.x + dx, z: voxel.z + dz }));

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

function renderLineup(models: readonly VoxelModel[], person: VoxelModel, size: number): Buffer {
  // Concatenated rather than spread into `push`: the hotel exceeds the argument limit.
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

async function chooseSources(
  positional: readonly string[],
  registry: readonly VoxelModelSource[],
): Promise<VoxelModelSource[]> {
  const files = positional.filter((arg) => arg.endsWith('.ts'));
  const ids = positional.filter((arg) => !arg.endsWith('.ts'));
  if (!ids.length && !files.length) return [...registry];

  // Looked up across every registry so `preview child` works without the flag.
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
  readonly sheet: string;
  // False for drafts, whose sweep would delete the pictures it had just written.
  readonly sweeps: boolean;
}

const FLAGGED_REGISTRIES: ReadonlyMap<string, Registry> = new Map([
  ['--people', { sources: PEOPLE_SOURCES, sheet: 'crowd', sweeps: true }],
  ['--sky', { sources: SKY_SOURCES, sheet: 'sky', sweeps: true }],
  ['--sea', { sources: SEA_SOURCES, sheet: 'sea', sweeps: true }],
  ['--drafts', { sources: DRAFT_SOURCES, sheet: 'drafts', sweeps: false }],
]);

const CATALOGUE: Registry = { sources: MODEL_SOURCES, sheet: 'contact-sheet', sweeps: true };

// Keeps ids from every registry, since other flags render into the same folder.
// Anything left in out/ ships in the bundle, so drafts and removed models are swept.
function sweepStale(outDir: string): void {
  const known = new Set(
    [...MODEL_SOURCES, ...PEOPLE_SOURCES, ...SKY_SOURCES, ...SEA_SOURCES].map(
      (source) => `${source.id}.png`,
    ),
  );
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
    // Sheets live in a subfolder so the app's non-recursive `out/*.png` glob does not
    // bundle them.
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
  // Only a whole-registry run sweeps, so naming a few ids never deletes anything.
  if (registry.sweeps && args.every((arg) => arg.startsWith('--'))) sweepStale(outDir);
}

await main();
