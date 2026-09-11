import type { RefObject } from 'react';
import { StatRow } from './StatRow';
import type { ShowcaseStats } from '../../../app/showcase';

export interface RenderStatsProps {
  readonly stats: ShowcaseStats | null;
  /** Filled with the node the render loop writes the live lamp count to. */
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const formatMegabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * The lamp row's tail: how many lamps could burn, and how many cannot.
 *
 * A lamp built beyond the ground the light grid was sized to cover has nowhere
 * in the volume to go, so it stays dark. It is worth saying out loud rather than
 * leaving the reader to wonder why the total stopped moving.
 */
function lampTotals(stats: ShowcaseStats): string {
  const outside = stats.lightCount - stats.litLightCount;
  const note = outside > 0 ? ` (${formatNumber(outside)} outside the grid)` : '';
  return ` of ${formatNumber(stats.litLightCount)}${note}`;
}

/** Everything the renderer knows about the frame it just drew. */
export function RenderStats({ stats, activeLightsElement }: RenderStatsProps) {
  if (!stats) return <p className="hud-loading">Meshing the catalogue…</p>;

  return (
    <dl className="hud-stats">
      <StatRow label="Backend">
        {stats.backend === 'webgpu' ? 'WebGPU' : 'WebGL2 (fallback)'}
      </StatRow>
      <StatRow label="Props / paths">
        {formatNumber(stats.propCount)} / {formatNumber(stats.pathCount)}
      </StatRow>
      <StatRow label="Instances">
        {formatNumber(stats.instanceCount)} of {stats.typeCount} types
      </StatRow>
      <StatRow label="Draw calls" note={`over ${stats.chunkCount} chunks`}>
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
      <StatRow label="Lamps">
        <span ref={activeLightsElement} className="hud-lights-active">
          0
        </span>
        {lampTotals(stats)}
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
    </dl>
  );
}
