import { objectTypeById } from '../features/catalog/domain/objectTypes';
import { buildTicks, sitePins } from '../features/construction/domain/construction';
import type { FrameUpdate } from '../features/hud/adapters/hudOverlay';
import { createMarkerSpots, type ViewSize } from '../features/hud/adapters/screenAnchors';
import { groundUnder } from '../features/hud/adapters/staffPinner';
import type { HudState } from '../features/hud/domain/hudStore';
import { MAX_WORKS } from '../features/hud/domain/markers';
import { roofOver } from '../features/hud/domain/staffPins';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import { upkeepRows, worksProgress } from '../features/resort-sim/domain/ageing';
import type { WorksPin } from '../features/sim/domain/condition';
import type { Resort } from './showcase';

const endOf = ({ works }: WorksPin): number =>
  works.kind === 'closing' ? Number.POSITIVE_INFINITY : works.until;

// By placement rather than venue: anything big enough to take time goes up as a site.
function roofOfBuilding(resort: Resort, key: string) {
  const building = resort.plot.placements.find((each) => each.key === key)!;
  return roofOver(
    building,
    groundUnder(resort, building),
    objectTypeById(building.id).model.height,
  );
}

const sitesOf = (resort: Resort): readonly WorksPin[] =>
  sitePins(
    resort.constructing,
    resort.plot.placements,
    (placement) => resort.names.get(placement.key) ?? objectTypeById(placement.id).label,
    (id) => buildTicks(objectTypeById(id).model),
  );

// Placed only when the works change, since finding them walks every building; projected with
// their progress every frame, as the markers are. Sites first: the player has just paid for them.
export function createWorksPins(parts: {
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
  let pinned: readonly WorksPin[] = [];
  let endsAt = Number.POSITIVE_INFINITY;

  return {
    view,
    get pinned(): number {
      return pinned.length;
    },
    place(): Pick<HudState, 'upkeep' | 'works'> {
      const resort = parts.current();
      const rows = resort.ageing ? upkeepRows(resort, parts.ticks()) : [];
      const renovations = rows.flatMap((row) => (row.works ? [{ ...row, works: row.works }] : []));
      pinned = [...sitesOf(resort), ...renovations].slice(0, MAX_WORKS);
      const renovating = pinned.filter((pin) => pin.works.kind === 'renovating');
      parts.showRenovations(new Set(renovating.map((pin) => pin.key)));
      endsAt = Math.min(Number.POSITIVE_INFINITY, ...pinned.map(endOf));
      spots.place(pinned.map((pin) => roofOfBuilding(resort, pin.key)));
      return { upkeep: rows, works: pinned };
    },
    // Told when works have ended since the last placing, so the HUD and the look follow.
    project(camera: SceneHandle['camera'], size: ViewSize, ended: () => void): void {
      const ticks = parts.ticks();
      if (ticks >= endsAt) ended();
      pinned.forEach((pin, index) => {
        progress[index] = worksProgress(pin.works, ticks);
      });
      spots.project(camera, size.width, size.height);
    },
  };
}
