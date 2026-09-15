import type { RefObject } from 'react';
import { StatRow } from './StatRow';
import type { ShowcaseStats } from '../../../app/showcase';

export interface RenderStatsProps {
  readonly stats: ShowcaseStats | null;
  /** Filled with the node the render loop writes the live lamp count to. */
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  /** Filled with the node the render loop writes what it actually drew to. */
  readonly drawnElement: RefObject<HTMLSpanElement | null>;
  /** Filled with the nodes the render loop writes what the frame cost to. */
  readonly frameCostElements: FrameCostElements;
}

/** The nodes the render loop writes a frame's cost to; see `hudOverlay.ts`. */
export interface FrameCostElements {
  readonly cpu: RefObject<HTMLSpanElement | null>;
  readonly detail: RefObject<HTMLSpanElement | null>;
  readonly shaders: RefObject<HTMLSpanElement | null>;
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
export function RenderStats({
  stats,
  activeLightsElement,
  drawnElement,
  frameCostElements: { cpu, detail, shaders },
}: RenderStatsProps) {
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
      <StatRow label="Draw calls" note={`in the scene, over ${stats.chunkCount} chunks`}>
        {formatNumber(stats.drawCalls)}
      </StatRow>
      <StatRow label="Drawn" note="last frame, after culling and level of detail">
        <span ref={drawnElement}>—</span>
      </StatRow>
      <StatRow label="Frame cost" note="main thread, and the GPU's own timing">
        <span ref={cpu}>—</span>
      </StatRow>
      <StatRow label="Detail" note="instanced buckets by level, last frame">
        <span ref={detail}>—</span>
      </StatRow>
      <StatRow label="Shaders built" note="climbing while moving means a stall">
        <span ref={shaders}>—</span>
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
      <StatRow label="Beds" note="taken by guests, of all the plot sleeps">
        {formatNumber(stats.beds.taken)} / {formatNumber(stats.beds.total)}
      </StatRow>
      <StatRow label="Venues" note="inside now, and queueing at a door">
        {formatNumber(stats.venues.inside)} / {formatNumber(stats.venues.waiting)}
      </StatRow>
      <StatRow label="Routes" note="flow fields built, one per venue walked to">
        {formatNumber(stats.routeFields)}
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
