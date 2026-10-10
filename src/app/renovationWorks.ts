import { objectTypeById } from '../features/catalog/domain/objectTypes';
import type { FrameUpdate } from '../features/hud/adapters/hudOverlay';
import { createMarkerSpots, type ViewSize } from '../features/hud/adapters/screenAnchors';
import { groundUnder } from '../features/hud/adapters/staffPinner';
import type { HudState } from '../features/hud/domain/hudStore';
import { MAX_WORKS } from '../features/hud/domain/markers';
import { roofOver } from '../features/hud/domain/staffPins';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { upkeepRows, worksProgress, type UpkeepRow } from '../features/resort-sim/domain/ageing';
import type { Resort } from './showcase';

const endOf = (row: UpkeepRow): number =>
  row.works?.kind === 'renovating' ? row.works.until : Number.POSITIVE_INFINITY;

function roofOfBuilding(resort: Resort, key: string) {
  const building =
    resort.venues.find((each) => each.key === key) ??
    resort.lodgings.find((each) => each.key === key)!;
  return roofOver(
    building,
    groundUnder(resort, building),
    objectTypeById(building.id).model.height,
  );
}

// Placed only when the works change, since finding them walks every building; projected with
// their progress every frame, as the markers are.
export function createRenovationWorks(parts: {
  readonly current: () => Resort;
  readonly ticks: () => number;
  readonly showRenovations: (keys: ReadonlySet<string>) => void;
}) {
  const spots = createMarkerSpots(MAX_WORKS);
  const progress = new Float32Array(MAX_WORKS);
  const view: FrameUpdate['works'] = {
    get count() {
      return spots.view.count;
    },
    spots: spots.view.spots,
    progress,
  };
  let pinned: readonly UpkeepRow[] = [];
  let endsAt = Number.POSITIVE_INFINITY;

  return {
    view,
    get pinned(): number {
      return pinned.length;
    },
    place(): Pick<HudState, 'upkeep' | 'works'> {
      const resort = parts.current();
      const rows = resort.ageing ? upkeepRows(resort, parts.ticks()) : [];
      pinned = rows.filter((row) => row.works !== null).slice(0, MAX_WORKS);
      const renovating = pinned.filter((row) => row.works?.kind === 'renovating');
      parts.showRenovations(new Set(renovating.map((row) => row.key)));
      endsAt = Math.min(Number.POSITIVE_INFINITY, ...renovating.map(endOf));
      spots.place(pinned.map((row) => roofOfBuilding(resort, row.key)));
      return { upkeep: rows, works: pinned };
    },
    // Told when a renovation has ended since the last placing, so the HUD and the look follow.
    project(camera: SceneHandle['camera'], size: ViewSize, ended: () => void): void {
      const ticks = parts.ticks();
      if (ticks >= endsAt) ended();
      pinned.forEach((row, index) => {
        progress[index] = worksProgress(row.works, ticks);
      });
      spots.project(camera, size.width, size.height);
    },
  };
}
