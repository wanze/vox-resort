// Talks CDP directly rather than via Puppeteer, to drive the user's own Chrome on their own GPU.
// Expects `pnpm dev` to be running already.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DEFAULT_WINDOW = { width: 1440, height: 900 };

// Matches the Retina display the app is used on.
const DEVICE_SCALE = 2;

interface BenchCase {
  readonly name: string;
  readonly view: 'overview' | 'street';
  readonly time: number;
  readonly note: string;
}

const SUITE: readonly BenchCase[] = [
  { name: 'day-overview', view: 'overview', time: 0.62, note: 'the view the app opens on' },
  { name: 'day-street', view: 'street', time: 0.62, note: 'daylight, camera at eye level' },
  { name: 'night-overview', view: 'overview', time: 0.02, note: 'the whole plot after dark' },
  { name: 'night-street', view: 'street', time: 0.02, note: 'after dark, camera at eye level' },
];

interface BenchStats {
  readonly frames: number;
  readonly fps: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly medianFps: number;
}

interface BenchReport {
  readonly backend: string;
  readonly pixelRatio: number;
  readonly drawingBufferSize: { readonly width: number; readonly height: number };
  readonly activeLights: number;
  readonly scene?: {
    readonly instanceCount: number;
    readonly lightCount: number;
    readonly lightGridBytes: number;
    readonly lightBakeMs: number;
    readonly dveMs: number;
    readonly meshMs: number;
    readonly startupMs: number;
    readonly meshedInWorker: boolean;
    readonly startupFrames: number;
  };
  readonly drawn?: { readonly drawCalls: number; readonly triangles: number };
  readonly stats: BenchStats;
  readonly gpu: BenchStats | null;
}

interface Cli {
  readonly url: string;
  readonly cases: readonly BenchCase[];
  readonly repeats: readonly number[];
  readonly warmup: number;
  readonly frames: number;
  readonly vsync: boolean;
  readonly webgl: boolean;
  readonly mainThread: boolean;
  readonly noDetail: boolean;
  readonly weather: string;
  readonly json: boolean;
  readonly label: string;
  readonly window: { readonly width: number; readonly height: number };
  readonly shotDir: string | null;
}

function parseCli(argv: readonly string[]): Cli {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (!argument.startsWith('--')) continue;
    const [name, inline] = argument.slice(2).split('=', 2);
    if (inline === undefined) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(name!, next);
        index++;
      } else flags.set(name!, 'true');
    } else flags.set(name!, inline);
  }

  const only = flags.get('case');
  const cases = only ? SUITE.filter((entry) => only.split(',').includes(entry.name)) : SUITE;
  if (cases.length === 0) throw new Error(`No such case: ${only}`);

  const rawRepeats = flags.get('repeat');
  const repeats = rawRepeats
    ? rawRepeats.split(',').map((value) => Number.parseInt(value, 10))
    : [1];

  return {
    url: flags.get('url') ?? 'http://localhost:5173/',
    cases,
    repeats,
    warmup: Number.parseInt(flags.get('warmup') ?? '150', 10),
    frames: Number.parseInt(flags.get('frames') ?? '600', 10),
    vsync: flags.get('no-vsync') === undefined,
    webgl: flags.get('webgl') !== undefined,
    mainThread: flags.get('no-worker') !== undefined,
    noDetail: flags.get('no-lod') !== undefined,
    weather: flags.get('weather') ?? '',
    json: flags.get('json') !== undefined,
    label: flags.get('label') ?? '',
    window: {
      width: Number.parseInt(flags.get('width') ?? String(DEFAULT_WINDOW.width), 10),
      height: Number.parseInt(flags.get('height') ?? String(DEFAULT_WINDOW.height), 10),
    },
    shotDir: flags.get('shots') ?? null,
  };
}

interface Browser {
  evaluate<T>(expression: string): Promise<T>;
  navigate(url: string): Promise<void>;
  screenshot(): Promise<string>;
  close(): Promise<void>;
}

async function readDevToolsUrl(userDataDir: string): Promise<string> {
  const portFile = join(userDataDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const [port, path] = (await readFile(portFile, 'utf8')).split('\n');
      if (port && path) return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
    } catch {
      // Chrome has not written the file yet.
    }
    await delay(50);
  }
  throw new Error('Chrome never reported a DevTools port');
}

async function launch(cli: Cli): Promise<Browser> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'vox-bench-'));
  const args = [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required',
    // Without this Dawn refuses timestamp queries, and the GPU columns stay empty.
    '--enable-dawn-features=allow_unsafe_apis',
    `--force-device-scale-factor=${DEVICE_SCALE}`,
    `--window-size=${cli.window.width},${cli.window.height}`,
    '--window-position=0,0',
    'about:blank',
  ];
  // With vsync on, anything faster than the refresh rate reads as exactly the refresh rate.
  if (!cli.vsync) args.splice(1, 0, '--disable-gpu-vsync', '--disable-frame-rate-limit');

  const child: ChildProcess = spawn(CHROME, args, { stdio: 'ignore' });
  const wsUrl = await readDevToolsUrl(userDataDir);

  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();
  const events = new Map<string, () => void>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      method?: string;
      result?: unknown;
      error?: { message: string };
    };
    if (message.method) {
      events.get(message.method)?.();
      return;
    }
    if (message.id === undefined) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });

  // Browser- and page-level commands share a frame; only the page's carries a sessionId, which
  // JSON.stringify drops when undefined.
  const senderFor =
    (sessionId?: string) =>
    <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        socket.send(JSON.stringify({ id, sessionId, method, params }));
      });
    };
  const send = senderFor();

  const { targetInfos } = await send<{ targetInfos: { targetId: string; type: string }[] }>(
    'Target.getTargets',
  );
  const page = targetInfos.find((target) => target.type === 'page');
  if (!page) throw new Error('Chrome opened no page target');
  const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', {
    targetId: page.targetId,
    flatten: true,
  });

  const sendToPage = senderFor(sessionId);

  await sendToPage('Page.enable');
  await sendToPage('Runtime.enable');

  return {
    async navigate(url) {
      const loaded = new Promise<void>((resolve) => events.set('Page.loadEventFired', resolve));
      await sendToPage('Page.navigate', { url });
      await loaded;
      events.delete('Page.loadEventFired');
    },
    async evaluate<T>(expression: string) {
      const response = await sendToPage<{
        result: { value?: T };
        exceptionDetails?: { text: string };
      }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value as T;
    },
    async screenshot() {
      const { data } = await sendToPage<{ data: string }>('Page.captureScreenshot', {
        format: 'png',
      });
      return data;
    },
    async close() {
      socket.close();
      child.kill();
      // Chrome flushes its profile on the way out; deleting under it races.
      for (let attempt = 0; attempt < 10; attempt++) {
        await delay(300);
        try {
          await rm(userDataDir, { recursive: true, force: true });
          return;
        } catch {
          // Still writing; give up quietly, it is a temp dir.
        }
      }
    },
  };
}

const CASE_TIMEOUT_MS = 180_000;

async function runCase(
  browser: Browser,
  cli: Cli,
  benchCase: BenchCase,
  repeat: number,
): Promise<BenchReport> {
  const params = new URLSearchParams({
    bench: '1',
    view: benchCase.view,
    time: String(benchCase.time),
    warmup: String(cli.warmup),
    frames: String(cli.frames),
    repeat: String(repeat),
  });
  if (cli.webgl) params.set('webgl', '1');
  if (cli.mainThread) params.set('worker', '0');
  if (cli.noDetail) params.set('lod', '0');
  if (cli.weather) params.set('weather', cli.weather);

  await browser.navigate(`${cli.url}?${params.toString()}`);

  const deadline = Date.now() + CASE_TIMEOUT_MS;
  for (;;) {
    const result = await browser.evaluate<BenchReport | null>(
      'globalThis.__voxBench ? JSON.parse(JSON.stringify(globalThis.__voxBench)) : null',
    );
    if (result) return result;
    const failure = await browser.evaluate<string | null>(
      "document.querySelector('.hud-error')?.textContent ?? null",
    );
    if (failure) throw new Error(`The showcase failed to mount: ${failure}`);
    if (Date.now() > deadline) throw new Error(`"${benchCase.name}" never finished measuring`);
    await delay(500);
  }
}

const pad = (value: string, width: number): string => value.padEnd(width);
const padStart = (value: string, width: number): string => value.padStart(width);

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const browser = await launch(cli);
  const rows: { case: string; repeat: number; report: BenchReport }[] = [];

  try {
    for (const benchCase of cli.cases) {
      for (const repeat of cli.repeats) {
        const report = await runCase(browser, cli, benchCase, repeat);
        rows.push({ case: benchCase.name, repeat, report });
        if (cli.shotDir) {
          await mkdir(cli.shotDir, { recursive: true });
          const suffix = repeat === 1 ? '' : `-x${repeat}`;
          const name = `${cli.label ? `${cli.label}-` : ''}${benchCase.name}${suffix}.png`;
          const png = await browser.screenshot();
          await writeFile(join(cli.shotDir, name.replaceAll(' ', '-')), Buffer.from(png, 'base64'));
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (cli.json) {
    console.info(JSON.stringify({ label: cli.label, vsync: cli.vsync, rows }, null, 2));
    return;
  }

  const backendRow = rows[0]!.report;
  console.info(
    `\n${cli.label ? `${cli.label} — ` : ''}${backendRow.backend}, ` +
      `${backendRow.drawingBufferSize.width}x${backendRow.drawingBufferSize.height} device pixels, ` +
      `dpr ${backendRow.pixelRatio}, vsync ${cli.vsync ? 'on' : 'off'}\n`,
  );
  const sweeping = cli.repeats.length > 1 || cli.repeats[0] !== 1;
  const header =
    pad('case', 16) +
    (sweeping ? padStart('plots', 7) : '') +
    padStart('on', 5) +
    padStart('calls', 7) +
    padStart('tris', 11) +
    padStart('fps', 9) +
    padStart('median', 9) +
    padStart('p95', 9) +
    padStart('gpu', 9) +
    padStart('gpu p95', 9);
  console.info(header);
  console.info('-'.repeat(header.length));
  for (const row of rows) {
    console.info(
      pad(row.case, 16) +
        (sweeping ? padStart(`${row.repeat * row.repeat}x`, 7) : '') +
        padStart(String(row.report.activeLights), 5) +
        padStart(row.report.drawn ? String(row.report.drawn.drawCalls) : '-', 7) +
        padStart(row.report.drawn ? row.report.drawn.triangles.toLocaleString('en-US') : '-', 11) +
        padStart(row.report.stats.fps.toFixed(1), 9) +
        padStart(`${row.report.stats.medianMs.toFixed(2)}ms`, 9) +
        padStart(`${row.report.stats.p95Ms.toFixed(2)}ms`, 9) +
        padStart(row.report.gpu ? `${row.report.gpu.medianMs.toFixed(2)}ms` : '-', 9) +
        padStart(row.report.gpu ? `${row.report.gpu.p95Ms.toFixed(2)}ms` : '-', 9),
    );
  }
  console.info('');
  for (const row of rows) {
    const { scene } = row.report;
    if (!scene) continue;
    console.info(
      `${pad(`${row.case} ${row.repeat * row.repeat}x`, 24)}` +
        `${scene.instanceCount.toLocaleString('en-US')} instances, ` +
        `${scene.lightCount} lamps, ` +
        `bake ${(scene.lightGridBytes / 1024 / 1024).toFixed(1)} MB in ${scene.lightBakeMs} ms, ` +
        `startup ${scene.startupMs} ms ` +
        `(${scene.dveMs} ms mesher${scene.meshedInWorker ? ' in a worker' : ' on the main thread'}, ` +
        `${scene.startupFrames} frames painted while it ran)`,
    );
  }
  console.info('');
}

await main();
