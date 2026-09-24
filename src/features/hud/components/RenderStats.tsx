import type { RefObject } from 'react';
import { StatRow } from './StatRow';
import type { ShowcaseStats } from '../../../app/showcase';
import type { Weather } from '../../sim/domain/weather';
import { STAFF_ROLES, type Roster, type StaffRole } from '../../sim/domain/staff';

export interface RenderStatsProps {
  readonly stats: ShowcaseStats | null;
  readonly activeLightsElement: RefObject<HTMLSpanElement | null>;
  readonly drawnElement: RefObject<HTMLSpanElement | null>;
  readonly frameCostElements: FrameCostElements;
}

export interface FrameCostElements {
  readonly cpu: RefObject<HTMLSpanElement | null>;
  readonly detail: RefObject<HTMLSpanElement | null>;
  readonly shaders: RefObject<HTMLSpanElement | null>;
}

const formatNumber = (value: number): string => value.toLocaleString('en-US');

const ROLE_NAMES: { readonly [role in StaffRole]: readonly [string, string] } = {
  cleaner: ['cleaner', 'cleaners'],
};

const rosterLine = (roster: Roster): string =>
  STAFF_ROLES.map((role) => {
    const [one, many] = ROLE_NAMES[role];
    return `${formatNumber(roster[role])} ${roster[role] === 1 ? one : many}`;
  }).join(' · ');

const WEATHER_LABELS: { readonly [kind in Weather]: string } = {
  clear: 'Clear',
  rain: 'Rain',
  storm: 'Storm',
  heatwave: 'Heatwave',
};

const WEATHER_NOTES: { readonly [kind in Weather]: string } = {
  clear: 'everywhere open',
  rain: 'everything without a roof is shut',
  storm: 'everything without a roof is shut, and it is tiring',
  heatwave: 'everywhere open, and everybody is thirsty',
};

const formatMegabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// A lamp beyond the ground the light grid covers stays dark; say so rather than let the total silently stop.
function lampTotals(stats: ShowcaseStats): string {
  const outside = stats.lightCount - stats.litLightCount;
  const note = outside > 0 ? ` (${formatNumber(outside)} outside the grid)` : '';
  return ` of ${formatNumber(stats.litLightCount)}${note}`;
}

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
      <StatRow label="Guests" note="on the plot now, of the bodies it was built for">
        {formatNumber(stats.guests.present)} / {formatNumber(stats.guests.capacity)}
      </StatRow>
      <StatRow label="Weather" note={WEATHER_NOTES[stats.weather]}>
        {WEATHER_LABELS[stats.weather]}
      </StatRow>
      <StatRow label="Rating" note="out of five, from how happy they are and how many have a bed">
        {stats.rating.toFixed(1)}
      </StatRow>
      <StatRow label="Beds" note="taken by guests, of all the plot sleeps">
        {formatNumber(stats.beds.taken)} / {formatNumber(stats.beds.total)}
      </StatRow>
      <StatRow label="Asleep" note="in bed now, of the guests who have one">
        {formatNumber(stats.asleep)} / {formatNumber(stats.beds.taken)}
      </StatRow>
      <StatRow label="Staff" note={`working now, of ${rosterLine(stats.staff.roster)} on duty`}>
        {formatNumber(stats.staff.working)} / {formatNumber(stats.staff.total)}
      </StatRow>
      <StatRow label="Cleanliness" note="mean over the venues standing">
        {Math.round(stats.cleanliness * 100)}%
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
