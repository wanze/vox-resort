import { normalizeTime } from '../../lighting/domain/dayNight';
import { WEATHERS, type Weather } from '../../sim/domain/weather';
import type { CameraFraming, WorldBounds } from '../../layout/domain/worldBounds';
import { cameraFramingFor } from '../../layout/domain/worldBounds';
import type { TierId } from '../../fireworks/domain/show';
import { MAX_STEP } from '../../crowd/domain/crowd';
import type { SimSpeed } from '../../sim/domain/simClock';

// Both are perspective only: docs/rendering.md was measured through that lens, and
// an orthographic camera culls and fogs differently. `street` exists because
// point-light cost is paid per lit fragment, which dominates at lamp height.
const VIEWS = ['overview', 'street'] as const;

export type BenchView = (typeof VIEWS)[number];

const BENCH_VIEWS: ReadonlySet<string> = new Set<string>(VIEWS);

const BENCH_WEATHERS: ReadonlySet<string> = new Set<string>(WEATHERS);

// Styles the authored plot, which otherwise keeps the originals so older numbers stay comparable.
const STYLES = ['mixed', 'scatter'] as const;

export type BenchStyles = (typeof STYLES)[number];

const BENCH_STYLES: ReadonlySet<string> = new Set<string>(STYLES);

const SPEEDS = ['normal', 'fast', 'rush'] as const satisfies readonly SimSpeed[];

type BenchSpeed = (typeof SPEEDS)[number];

const BENCH_SPEEDS: ReadonlySet<string> = new Set<string>(SPEEDS);

const FOLLOWS = ['first', 'third'] as const;

type BenchFollow = (typeof FOLLOWS)[number];

const BENCH_FOLLOWS: ReadonlySet<string> = new Set<string>(FOLLOWS);

const FIREWORKS: ReadonlySet<string> = new Set<TierId>(['small', 'medium', 'grand']);

export interface BenchConfig {
  readonly view: BenchView;
  readonly time: number;
  readonly warmupFrames: number;
  readonly measureFrames: number;
  readonly repeat: number;
  readonly forceWebGL: boolean;
  readonly forceMainThreadMeshing: boolean;
  readonly detail: boolean;
  readonly weather: Weather | null;
  readonly styles?: BenchStyles;
  // Paves the authored plot wall to wall in mosaic, to price the pieces' draw calls.
  readonly mosaic?: true;
  // Plays a show of this size over the sea, for its cost alone: no guests watch and nothing sounds.
  readonly fireworks?: TierId;
  // The authored plot has no shore, so the sea, its boats and the beach crowd are measured here.
  readonly plot?: 'reference';
  // Runs the clock, so the sim, both routers and the crowd at its real scale are measured too.
  readonly speed?: BenchSpeed;
  // Follows the first guest walking, so the frame at a guest's eye or shoulder is measured.
  readonly follow?: BenchFollow;
}

export const DEFAULT_BENCH: BenchConfig = {
  view: 'overview',
  time: 0.62,
  warmupFrames: 120,
  measureFrames: 600,
  repeat: 1,
  forceWebGL: false,
  forceMainThreadMeshing: false,
  detail: true,
  weather: null,
};

// The plot is built `repeat` squared times, and `?bench=` is read in production too.
const MAX_BENCH_REPEAT = 10;

const integerParam = (
  raw: string | null,
  fallback: number,
  min: number,
  max = Number.POSITIVE_INFINITY,
): number => {
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

export function parseBenchConfig(search: string): BenchConfig | null {
  const params = new URLSearchParams(search);
  const flag = params.get('bench');
  if (flag === null || flag === '0' || flag === 'false') return null;

  const rawView = params.get('view');
  const view =
    rawView !== null && BENCH_VIEWS.has(rawView) ? (rawView as BenchView) : DEFAULT_BENCH.view;

  const rawTime = params.get('time');
  const parsedTime = rawTime === null ? Number.NaN : Number.parseFloat(rawTime);
  const time = Number.isFinite(parsedTime) ? normalizeTime(parsedTime) : DEFAULT_BENCH.time;

  const rawWeather = params.get('weather');
  const weather =
    rawWeather !== null && BENCH_WEATHERS.has(rawWeather)
      ? (rawWeather as Weather)
      : DEFAULT_BENCH.weather;

  const rawStyles = params.get('styles');
  const styles =
    rawStyles !== null && BENCH_STYLES.has(rawStyles) ? (rawStyles as BenchStyles) : null;

  return {
    view,
    time,
    warmupFrames: integerParam(params.get('warmup'), DEFAULT_BENCH.warmupFrames, 0),
    measureFrames: integerParam(params.get('frames'), DEFAULT_BENCH.measureFrames, 1),
    repeat: integerParam(params.get('repeat'), DEFAULT_BENCH.repeat, 1, MAX_BENCH_REPEAT),
    forceWebGL: params.get('webgl') === '1',
    forceMainThreadMeshing: params.get('worker') === '0',
    detail: params.get('lod') !== '0',
    weather,
    ...(styles ? { styles } : {}),
    ...(params.get('mosaic') === '1' ? { mosaic: true as const } : {}),
    ...fireworksOf(params.get('fireworks')),
    ...(params.get('plot') === 'reference' ? { plot: 'reference' as const } : {}),
    ...speedOf(params.get('speed')),
    ...followOf(params.get('follow')),
  };
}

// The timers cost a query resolve and a buffer map every frame, so only a bench or ?gpu pays.
export function timesGpu(search: string): boolean {
  if (parseBenchConfig(search) !== null) return true;
  const flag = new URLSearchParams(search).get('gpu');
  return flag !== null && flag !== '0' && flag !== 'false';
}

// Each of these remakes the authored plot; the reference resort is measured as it was built.
export function benchRefusal(config: BenchConfig): string | null {
  if (config.plot !== 'reference') return null;
  const remade = config.repeat > 1 || config.styles !== undefined || config.mosaic === true;
  return remade
    ? 'Repeat, styles and mosaic remake the authored plot, not the reference resort'
    : null;
}

const fireworksOf = (raw: string | null): { readonly fireworks?: TierId } =>
  raw !== null && FIREWORKS.has(raw) ? { fireworks: raw as TierId } : {};

const speedOf = (raw: string | null): { readonly speed?: BenchSpeed } =>
  raw !== null && BENCH_SPEEDS.has(raw) ? { speed: raw as BenchSpeed } : {};

const followOf = (raw: string | null): { readonly follow?: BenchFollow } =>
  raw !== null && BENCH_FOLLOWS.has(raw) ? { follow: raw as BenchFollow } : {};

// A 60 Hz player's frame. MAX_STEP would hand a running sim six times that and measure a frame
// rate nobody plays at; paused runs keep it, so every paused number recorded still compares.
const RUNNING_STEP = 1 / 60;

export function benchStep(config: BenchConfig): number {
  return config.speed ? RUNNING_STEP : MAX_STEP;
}

const STREET_EYE_HEIGHT = 14;

export function benchFraming(
  view: BenchView,
  bounds: WorldBounds,
  verticalFovDegrees: number,
): CameraFraming {
  if (view === 'overview') return cameraFramingFor(bounds, verticalFovDegrees);

  const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
  const centerZ = bounds.minZ + (bounds.maxZ - bounds.minZ) / 2;
  const depth = bounds.maxZ - bounds.minZ;
  return {
    position: { x: centerX, y: STREET_EYE_HEIGHT, z: centerZ + depth * 0.25 },
    target: { x: centerX, y: STREET_EYE_HEIGHT * 0.6, z: centerZ - depth * 0.25 },
  };
}
