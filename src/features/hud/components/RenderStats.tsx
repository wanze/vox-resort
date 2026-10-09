import type { RefObject } from 'react';
import { StatRow } from '../../../shared/components/StatRow';
import type { ShowcaseStats } from '../domain/views';

export interface DebugElements {
  readonly fps: RefObject<HTMLSpanElement | null>;
  readonly cpu: RefObject<HTMLSpanElement | null>;
  readonly gpu: RefObject<HTMLSpanElement | null>;
  readonly drawn: RefObject<HTMLSpanElement | null>;
  readonly detail: RefObject<HTMLSpanElement | null>;
  readonly people: RefObject<HTMLSpanElement | null>;
  readonly shaders: RefObject<HTMLSpanElement | null>;
  readonly activeLights: RefObject<HTMLSpanElement | null>;
}

export interface RenderStatsProps {
  readonly stats: ShowcaseStats | null;
  readonly elements: DebugElements;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const formatMegabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// A lamp beyond the ground the light grid covers stays dark; say so rather than let the total silently stop.
function lampTotals(stats: ShowcaseStats): string {
  const outside = stats.lightCount - stats.litLightCount;
  const note = outside > 0 ? ` (${formatNumber(outside)} outside the grid)` : '';
  return ` of ${formatNumber(stats.litLightCount)}${note}`;
}

// The live rows sit first and in fixed lines: they change twice a second, and a row that
// rewrapped as a number grew would make the whole window jump.
function LiveRows({
  elements: { fps, cpu, gpu, drawn, detail, people, shaders },
}: {
  readonly elements: DebugElements;
}) {
  return (
    <>
      <StatRow label="FPS">
        <span ref={fps} className="hud-debug-fps">
          —
        </span>
      </StatRow>
      <StatRow label="Frame cost" note="main thread over the last second">
        <span ref={cpu}>—</span>
      </StatRow>
      <StatRow label="Render" note="last frame's submit, and the GPU's own timing">
        <span ref={gpu}>—</span>
      </StatRow>
      <StatRow label="Drawn" note="last frame, after culling and level of detail">
        <span ref={drawn}>—</span>
      </StatRow>
      <StatRow label="Detail" note="instanced buckets by level">
        <span ref={detail}>—</span>
      </StatRow>
      <StatRow label="People" note="drawn, of all on the plot">
        <span ref={people}>—</span>
      </StatRow>
      <StatRow label="Shaders built" note="climbing while moving means a stall">
        <span ref={shaders}>—</span>
      </StatRow>
    </>
  );
}

export function RenderStats({ stats, elements }: RenderStatsProps) {
  const { activeLights } = elements;
  return (
    <dl className="ui-stats ui-stats--stacked hud-figures hud-debug">
      <LiveRows elements={elements} />
      {stats ? (
        <>
          <StatRow label="Backend">
            {stats.backend === 'webgpu' ? 'WebGPU' : 'WebGL2 (fallback)'}
          </StatRow>
          <StatRow
            label="Objects"
            note={`${formatNumber(stats.propCount)} props, ${formatNumber(stats.pathCount)} paths`}
          >
            {formatNumber(stats.objectCount)}
          </StatRow>
          <StatRow label="Instances" note={`of ${stats.typeCount} types`}>
            {formatNumber(stats.instanceCount)}
          </StatRow>
          <StatRow label="Draw calls" note={`in the scene, over ${stats.chunkCount} chunks`}>
            {formatNumber(stats.drawCalls)}
          </StatRow>
          <StatRow
            label="Triangles"
            note={`${formatNumber(stats.uniqueTriangleCount)} uploaded, merged from ${formatNumber(stats.unmergedTriangleCount)}`}
          >
            {formatNumber(stats.drawnTriangleCount)}
          </StatRow>
          <StatRow label="Voxels" note={`${formatNumber(stats.meshedVoxelCount)} meshed`}>
            {formatNumber(stats.sceneVoxelCount)}
          </StatRow>
          <StatRow label="Routes" note="flow fields built, one per venue walked to">
            {formatNumber(stats.routeFields)}
          </StatRow>
          <StatRow label="Lamps" note={`lit now${lampTotals(stats)}`}>
            <span ref={activeLights}>0</span>
          </StatRow>
          <StatRow
            label="Light bake"
            note={`${formatMegabytes(stats.lightGridBytes)}, ${stats.lightBakeMs} ms`}
          >
            {formatNumber(stats.lightGridCells)} cells
          </StatRow>
          <StatRow
            label="Shading"
            note={`${formatNumber(stats.occluderCount)} shade the sky, ${stats.skyBakeMs} ms baked`}
          >
            {formatNumber(stats.shadowCount)} blobs
          </StatRow>
          <StatRow
            label="Startup"
            note={`${formatNumber(stats.dveMs)} ms voxel mesher, ${formatNumber(stats.meshMs - stats.dveMs)} ms merge`}
          >
            {formatNumber(stats.startupMs)} ms{stats.meshedInWorker ? ' in a worker' : ''}
          </StatRow>
        </>
      ) : null}
    </dl>
  );
}
