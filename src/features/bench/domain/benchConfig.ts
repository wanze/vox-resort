/**
 * The benchmark harness's configuration, parsed from the page URL.
 *
 * Adding `?bench=1` to the dev server URL pins the camera, freezes the clock and
 * measures a fixed number of frames, so two builds can be compared on the same
 * pixels rather than on whatever the mouse happened to be doing. Without the
 * flag none of this costs anything: the showcase never leaves its normal path.
 *
 * The camera presets are derived from the plot's bounds, so they survive the
 * resort growing — which it is meant to.
 */

import { normalizeTime } from "../../lighting/domain/dayNight";
import type { CameraFraming, WorldBounds } from "../../layout/domain/worldBounds";
import { cameraFramingFor } from "../../layout/domain/worldBounds";

/**
 * `overview` is the framing the app opens on: the whole plot at a slant, so the
 * measurement covers every instance and every draw call.
 *
 * `street` drops the camera to lamp height in the middle of the plot. That is
 * the view the night cost actually shows up in — a point light overhead fills
 * far more of the screen from down there than it does from the overview, and
 * point-light cost is paid per lit fragment.
 */
export type BenchView = "overview" | "street";

export const BENCH_VIEWS: readonly BenchView[] = ["overview", "street"];

export interface BenchConfig {
  readonly view: BenchView;
  /** Normalised time of day the clock is frozen at, 0..1. */
  readonly time: number;
  /** Frames rendered and thrown away before measuring, so caches and shaders settle. */
  readonly warmupFrames: number;
  /** Frames the report is computed from. */
  readonly measureFrames: number;
  /**
   * Tiles the plot this many times on each axis, so a resort several times the
   * authored size can actually be measured rather than argued about.
   */
  readonly repeat: number;
  /**
   * Forces the renderer onto its WebGL2 backend. Both backends have to keep
   * working, and the only way to know is to render the resort on each.
   */
  readonly forceWebGL: boolean;
  /**
   * Meshes the catalogue on the main thread instead of in a worker. The
   * fallback path has to keep working, and the contrast is what shows what the
   * worker is worth.
   */
  readonly forceMainThreadMeshing: boolean;
}

export const DEFAULT_BENCH: BenchConfig = {
  view: "overview",
  time: 0.62,
  warmupFrames: 120,
  measureFrames: 600,
  repeat: 1,
  forceWebGL: false,
  forceMainThreadMeshing: false,
};

const integerParam = (raw: string | null, fallback: number, min: number): number => {
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
};

/** Reads a bench config out of a query string; `null` when `bench` is absent. */
export function parseBenchConfig(search: string): BenchConfig | null {
  const params = new URLSearchParams(search);
  const flag = params.get("bench");
  if (flag === null || flag === "0" || flag === "false") return null;

  const rawView = params.get("view");
  const view = BENCH_VIEWS.includes(rawView as BenchView)
    ? (rawView as BenchView)
    : DEFAULT_BENCH.view;

  const rawTime = params.get("time");
  const parsedTime = rawTime === null ? Number.NaN : Number.parseFloat(rawTime);
  const time = Number.isFinite(parsedTime) ? normalizeTime(parsedTime) : DEFAULT_BENCH.time;

  return {
    view,
    time,
    warmupFrames: integerParam(params.get("warmup"), DEFAULT_BENCH.warmupFrames, 0),
    measureFrames: integerParam(params.get("frames"), DEFAULT_BENCH.measureFrames, 1),
    repeat: integerParam(params.get("repeat"), DEFAULT_BENCH.repeat, 1),
    forceWebGL: params.get("webgl") === "1",
    forceMainThreadMeshing: params.get("worker") === "0",
  };
}

/** How high above the ground the `street` camera stands, in voxels. */
const STREET_EYE_HEIGHT = 14;

/**
 * Where the camera stands for a preset. Both presets are pure functions of the
 * plot, so a bigger resort is still framed the same way.
 */
export function benchFraming(
  view: BenchView,
  bounds: WorldBounds,
  verticalFovDegrees: number,
): CameraFraming {
  if (view === "overview") return cameraFramingFor(bounds, verticalFovDegrees);

  const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
  const centerZ = bounds.minZ + (bounds.maxZ - bounds.minZ) / 2;
  const depth = bounds.maxZ - bounds.minZ;
  return {
    // Standing a quarter of the plot south of the middle, looking north across
    // it: buildings fill the frame and the lamps are at eye level.
    position: { x: centerX, y: STREET_EYE_HEIGHT, z: centerZ + depth * 0.25 },
    target: { x: centerX, y: STREET_EYE_HEIGHT * 0.6, z: centerZ - depth * 0.25 },
  };
}
