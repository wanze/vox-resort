import type { RefObject } from "react";
import type { ShowcaseStats } from "../../app/showcase";

export interface FpsCounterProps {
  readonly fps: number;
  readonly stats: ShowcaseStats | null;
  /** Filled with the two nodes the render loop writes to directly, outside React. */
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly cycling: boolean;
  readonly onTimeChange: (time: number) => void;
  readonly onCyclingChange: (cycling: boolean) => void;
}

const formatNumber = (value: number): string => value.toLocaleString("en-US");

const formatMegabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function FpsCounter(props: FpsCounterProps) {
  const { fps, stats, activeLightsElement, timeElement, cycling, onTimeChange, onCyclingChange } =
    props;

  return (
    <section className="hud-panel" aria-label="Renderer statistics">
      <div className="hud-fps">
        <span className="hud-fps-value">{fps}</span>
        <span className="hud-fps-unit">fps</span>
      </div>
      {stats ? (
        <>
          <dl className="hud-stats">
            <div>
              <dt>Backend</dt>
              <dd>{stats.backend === "webgpu" ? "WebGPU" : "WebGL2 (fallback)"}</dd>
            </div>
            <div>
              <dt>Objects</dt>
              <dd>{formatNumber(stats.objectCount)}</dd>
            </div>
            <div>
              <dt>Props / paths</dt>
              <dd>
                {formatNumber(stats.propCount)} / {formatNumber(stats.pathCount)}
              </dd>
            </div>
            <div>
              <dt>Instances</dt>
              <dd>
                {formatNumber(stats.instanceCount)} of {stats.typeCount} types
              </dd>
            </div>
            <div>
              <dt>Draw calls</dt>
              <dd>
                {formatNumber(stats.drawCalls)}{" "}
                <span className="hud-stat-note">(over {stats.chunkCount} chunks)</span>
              </dd>
            </div>
            <div>
              <dt>Triangles</dt>
              <dd>
                {formatNumber(stats.drawnTriangleCount)}{" "}
                <span className="hud-stat-note">
                  ({formatNumber(stats.uniqueTriangleCount)} uploaded, merged from{" "}
                  {formatNumber(stats.unmergedTriangleCount)})
                </span>
              </dd>
            </div>
            <div>
              <dt>Voxels</dt>
              <dd>
                {formatNumber(stats.sceneVoxelCount)}{" "}
                <span className="hud-stat-note">
                  ({formatNumber(stats.meshedVoxelCount)} meshed)
                </span>
              </dd>
            </div>
            <div>
              <dt>Lamps</dt>
              <dd>
                <span ref={activeLightsElement} className="hud-lights-active">
                  0
                </span>
                {` of ${formatNumber(stats.lightCount)}`}
              </dd>
            </div>
            <div>
              <dt>Light bake</dt>
              <dd>
                {formatNumber(stats.lightGridCells)} cells{" "}
                <span className="hud-stat-note">
                  ({formatMegabytes(stats.lightGridBytes)}, {stats.lightBakeMs} ms)
                </span>
              </dd>
            </div>
            <div>
              <dt>Startup</dt>
              <dd>
                {formatNumber(stats.startupMs)} ms{stats.meshedInWorker ? " in a worker" : ""}{" "}
                <span className="hud-stat-note">
                  ({formatNumber(stats.dveMs)} ms voxel mesher,{" "}
                  {formatNumber(stats.meshMs - stats.dveMs)} ms merge)
                </span>
              </dd>
            </div>
          </dl>
          <div className="hud-time">
            <label className="hud-time-row">
              <span>Time of day</span>
              <input
                ref={timeElement}
                type="range"
                min={0}
                max={1}
                step={0.002}
                defaultValue={0.62}
                onChange={(event) => onTimeChange(Number(event.target.value))}
                aria-label="Time of day"
              />
            </label>
            <label className="hud-time-row hud-time-cycle">
              <input
                type="checkbox"
                checked={cycling}
                onChange={(event) => onCyclingChange(event.target.checked)}
              />
              <span>Run day/night cycle</span>
            </label>
          </div>
        </>
      ) : (
        <p className="hud-loading">Meshing the catalogue…</p>
      )}
    </section>
  );
}
