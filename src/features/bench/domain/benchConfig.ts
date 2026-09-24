import { normalizeTime } from '../../lighting/domain/dayNight';
import { WEATHERS, type Weather } from '../../sim/domain/weather';
import type { CameraFraming, WorldBounds } from '../../layout/domain/worldBounds';
import { cameraFramingFor } from '../../layout/domain/worldBounds';

// Both are perspective only: docs/rendering.md was measured through that lens, and
// an orthographic camera culls and fogs differently. `street` exists because
// point-light cost is paid per lit fragment, which dominates at lamp height.
export type BenchView = 'overview' | 'street';

const BENCH_VIEWS: ReadonlySet<string> = new Set<BenchView>(['overview', 'street']);

const BENCH_WEATHERS: ReadonlySet<string> = new Set<string>(WEATHERS);

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

const integerParam = (raw: string | null, fallback: number, min: number): number => {
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
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

  return {
    view,
    time,
    warmupFrames: integerParam(params.get('warmup'), DEFAULT_BENCH.warmupFrames, 0),
    measureFrames: integerParam(params.get('frames'), DEFAULT_BENCH.measureFrames, 1),
    repeat: integerParam(params.get('repeat'), DEFAULT_BENCH.repeat, 1),
    forceWebGL: params.get('webgl') === '1',
    forceMainThreadMeshing: params.get('worker') === '0',
    detail: params.get('lod') !== '0',
    weather,
  };
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
