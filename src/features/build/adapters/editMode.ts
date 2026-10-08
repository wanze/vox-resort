import { mosaicKitOf } from '../../catalog/domain/mosaics';
import {
  familyOf,
  isGateway,
  OBJECT_TYPES,
  objectTypeById,
  objectTypeTop,
} from '../../catalog/domain/objectTypes';
import { buildCostOf, costToStand, DIG_COST, refundOf } from '../../catalog/domain/prices';
import { blobOf } from '../../catalog/domain/placementFacts';
import type { LayoutItem, Placement } from '../../layout/domain/resortLayout';
import { railModelsIn } from '../../layout/domain/resortLayout';
import { listOf } from '../../layout/domain/placementLists';
import type { ResortPlan } from '../../layout/domain/resortPlan';
import {
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
  JETTY_ID,
  PATH_ID,
  STAIRS_ID,
  STAIRCASE_ID,
  RAMP_FOOT_ID,
  RAMP_HEAD_ID,
} from '../../layout/domain/resortPlan';
import type { Terrain } from '../../layout/domain/terrain';
import { overlooksDrop } from '../../layout/domain/terrain';
import type { Plot } from '../../resort-prep/domain/prepareResort';
import { facesUnowned, ownsTile, type LandRights } from '../../land/domain/landRights';
import { paintZone, type Zones } from '../../sim/domain/zones';
import type { Reason } from '../../sim/domain/ledger';
import {
  advanceSites,
  buildSeconds,
  openSite,
  progressOf,
  revealHeightOf,
  type ConstructionSite,
} from '../../construction/domain/construction';
import type { ConstructionField } from '../../construction/adapters/constructionField';
import type { InstancedWorld } from '../../rendering/adapters/instancedWorld';
import type { BlobShadowField } from '../../rendering/adapters/blobShadowField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import type { SceneHandle } from '../../rendering/adapters/threeScene';
import type { BuildCue } from '../../sound/domain/cues';
import { layoutItemFor } from '../domain/buildPlan';
import { itemChooser } from '../domain/stylePick';
import {
  isPaving,
  pavedGroundOf,
  raisedProvider,
  wantsStairsOf,
  type PavingRules,
} from '../domain/paving';
import type { HandrailRules } from '../domain/handrails';
import type { TerrainRules } from '../domain/terrainBrush';
import {
  armedBrush,
  armedObject,
  armedLand,
  armedRemove,
  armedZone,
  type BuildTool,
} from '../domain/buildTool';
import type { TileOccupancy } from '../domain/tileOccupancy';
import { footprintTiles } from '../domain/tileOccupancy';
import type { RailIndex } from '../domain/railIndex';
import type { PickGround } from '../domain/groundPick';
import { createTerrainPointer } from './terrainPointer';
import { createLandPointer, type LandPointerOptions } from './landPointer';
import { createZonePointer } from './zonePointer';
import { createDemolishPointer } from './demolishPointer';
import { createBuildPointer } from './buildPointer';
import { createPlacementGhost } from './placementGhost';

export interface EditLighting {
  add(placement: Placement): void;
  light(placement: Placement): void;
  unlight(placement: Placement): void;
  unshade(placement: Placement): void;
}

export interface EditableResort {
  readonly plot: Plot;
  readonly occupancy: TileOccupancy;
  readonly terrain: Terrain;
  readonly rights: LandRights | null;
  readonly plan: ResortPlan;
  readonly railIndex: RailIndex;
  readonly zones: Zones;
  readonly world: Pick<InstancedWorld, 'add' | 'remove'>;
  readonly shadows: Pick<BlobShadowField, 'add' | 'remove'>;
  readonly construction: Pick<ConstructionField, 'show' | 'hide'>;
  readonly lighting: EditLighting;
}

// A re-laid slab appears at once: paving re-stands under one key, and a slab missing for a moment
// is a hole in the path.
function buildTimeOf(placement: Placement, lifted?: Placement): number {
  if (lifted) return 0;
  const { model } = objectTypeById(placement.id);
  return buildSeconds({
    category: model.category,
    height: model.height,
    voxelCount: model.voxels.length,
  });
}

// By family: a Street Lamp B filed by its own id would be looked for among the buildings,
// and a bulldozed one would linger in the props.
function listFor(plot: Plot, id: string): Placement[] {
  return plot[listOf(familyOf(id))];
}

export interface EditMode {
  select(tool: BuildTool | null): void;
  advance(dt: number): void;
  abandon(): void;
  // Raises every open site at once, so what is saved is what stands.
  finishAll(): void;
  // Carried over a settle, whose rebuild stands everything in the plot as finished.
  openSites(): readonly ConstructionSite[];
  reopen(open: readonly ConstructionSite[]): void;
  readonly ground: PickGround;
  placementOf(key: string): Placement | undefined;
  // For the placement a finger left waiting, with whichever of objects or land is armed.
  confirm(): void;
  dismiss(): void;
  turn(quarters: number): void;
  dispose(): void;
}

export interface Purse {
  canAfford(amount: number): boolean;
  spend(reason: Reason, amount: number): void;
  refund(amount: number): void;
}

// Occupancy keeps the layout's overlap check live, so a hover costs a map lookup per footprint
// tile.
export function createEditMode(parts: {
  readonly canvas: HTMLCanvasElement;
  readonly handle: SceneHandle;
  readonly resort: () => EditableResort;
  readonly geometries: readonly ModelGeometry[];
  readonly onChange: () => void;
  // Placing counts too: the ground under anything standing is drawn square.
  readonly onGroundChange: () => void;
  // Only for a tile whose zone changed, so a drag over painted tiles deals nobody afresh.
  readonly onZonesChange: () => void;
  readonly onCancel: () => void;
  readonly onLift: (placement: Placement) => void;
  readonly money: Purse;
  readonly onRefused: (refusal: Refusal) => void;
  readonly onFallback: (fellBack: boolean) => void;
  readonly onPending: (pending: boolean) => void;
  readonly land: Pick<LandPointerOptions, 'canBuy' | 'onBuy'>;
  readonly onCue: (cue: BuildCue) => void;
}): EditMode {
  const { canvas, handle, resort, onChange, onCancel } = parts;
  const ghost = createPlacementGhost(parts.geometries);
  handle.scene.add(ghost.group);

  // The pointer outlives every resort, so it forwards to whichever one is standing.
  const occupancy: TileOccupancy = {
    isFree: (footprint) => resort().occupancy.isFree(footprint),
    keyAt: (tile) => resort().occupancy.keyAt(tile),
    claim: (footprint, key) => resort().occupancy.claim(footprint, key),
    release: (footprint, key) => resort().occupancy.release(footprint, key),
    get size() {
      return resort().occupancy.size;
    },
  };

  // Forwarded too: the ground itself moves under the pointer.
  const ground: PickGround = {
    levelOf: (tileX, tileZ) => resort().terrain.levelOf(tileX, tileZ),
    get maxLevel() {
      return resort().terrain.maxLevel;
    },
  };

  const catalogue = OBJECT_TYPES.map(layoutItemFor);
  const pavingItems = catalogue.filter((item) => isPaving(item));
  const pavingIds: ReadonlySet<string> = new Set(pavingItems.map((item) => item.id));
  const pavingItem = (id: string): LayoutItem | null =>
    pavingItems.find((item) => item.id === id) ?? null;
  const pavedWith = pavedGroundOf(occupancy, pavingItems);
  const paving: PavingRules = {
    pavedWith,
    levelOf: ground.levelOf,
    // Sand is asked of the ground, not the shore, so a hand-drawn dune path gets decking like a
    // generated one.
    isSand: (tileX, tileZ) => resort().terrain.surfaceOf(tileX, tileZ) === 'sand',
    isWater: (tileX, tileZ) => resort().terrain.surfaceOf(tileX, tileZ) === 'water',
    // The base, not the tile as it stands: a river gets a bridge and the bay gets a pier.
    isSea: (tileX, tileZ) => resort().terrain.isSea(tileX, tileZ),
    decking: pavingItem(BOARDWALK_ID),
    pier: pavingItem(JETTY_ID),
    bridge: pavingItem(BRIDGE_ID),
    bridgeRamp: pavingItem(BRIDGE_RAMP_ID),
    stairs: pavingItem(STAIRS_ID),
    staircase: pavingItem(STAIRCASE_ID),
    rampFoot: pavingItem(RAMP_FOOT_ID),
    rampHead: pavingItem(RAMP_HEAD_ID),
    flagstones: pavingItem(PATH_ID),
    mosaic: mosaicKitOf(pavingItems),
  };

  // Standing rails come from the rail index: rails are not in occupancy, and scanning the plot per
  // edit is too slow on a drag.
  const owns = (tileX: number, tileZ: number): boolean => {
    const { rights, plan } = resort();
    return ownsTile(rights, plan, tileX, tileZ);
  };
  const ownsFootprint = (placement: Placement): boolean =>
    footprintTiles(placement).every((tile) => owns(tile.x, tile.z));
  // Placing only: buying the land in front of a gate later is allowed, and it then stands inland.
  const fitsEdge = (placement: Placement): boolean => {
    const { rights, plan } = resort();
    return rights === null || !isGateway(placement.id) || facesUnowned(rights, placement, plan);
  };

  const handrails: HandrailRules = {
    pavedWith,
    levelOf: ground.levelOf,
    isWater: paving.isWater,
    isSpan: raisedProvider(paving),
    wantsStairs: wantsStairsOf(paving),
    models: railModelsIn(catalogue),
    standing: (tileX, tileZ) => resort().railIndex.at(tileX, tileZ),
  };

  // Naming the holder rather than counting: otherwise arming one tool while another is armed
  // can hand the button back to the camera with a tool still in hand.
  let holder: BuildTool['kind'] | null = null;
  const lendLeftButton =
    (who: BuildTool['kind']) =>
    (taken: boolean): void => {
      if (taken) holder = who;
      else if (holder === who) holder = null;
      handle.takeLeftButton(holder !== null);
    };

  // Only the armed tool's stroke ever lends it, and only while a finger holds its anchor.
  const lendFinger = (taken: boolean): void => handle.takeFinger(taken);

  const changeRails = (stand: readonly Placement[], lift: readonly Placement[]): void => {
    const { world, lighting, railIndex } = resort();
    for (const rail of lift) {
      world.remove(rail.key);
      lighting.unlight(rail);
      railIndex.remove(rail);
    }
    // Lifted first, so edge rails and a balustrade never stand at once and a re-stood lantern goes
    // out before it is lit.
    for (const rail of stand) {
      world.add(rail);
      lighting.light(rail);
      railIndex.add(rail);
    }
    onChange();
  };

  // Also lifts the slab a stair flight replaces, or the tile would be double-booked.
  const lift = (placement: Placement): void => {
    const { plot, world, lighting, shadows } = resort();
    parts.onLift(placement);
    occupancy.release(placement, placement.key);
    // A building still going up was never raised, so cancelling its site is all of taking it down.
    if (cancelSite(placement.key)) {
      const laid = listFor(plot, placement.id);
      const at = laid.findIndex((standing) => standing.key === placement.key);
      if (at !== -1) laid.splice(at, 1);
      return;
    }
    world.remove(placement.key);
    lighting.unlight(placement);
    // Without this, every pass over a re-laid bridge deck stacks another shading box under the same
    // key.
    lighting.unshade(placement);
    // Likewise, a re-laid bridge would otherwise stack a shadow quad per pass.
    shadows.remove(placement.key);
    const laid = listFor(plot, placement.id);
    const at = laid.findIndex((standing) => standing.key === placement.key);
    if (at !== -1) laid.splice(at, 1);
  };

  // Only over a terrace drop: rebuilding the terrain per tile of a flat drag is too costly.
  const reshapesGround = (placement: Placement): boolean =>
    footprintTiles(placement).some((tile) => overlooksDrop(resort().terrain, tile.x, tile.z));

  // Deferred until finished: blob shadows are sized from full height, and lanterns must not burn
  // over a foundation.
  const raise = (placement: Placement): void => {
    const { world, lighting, shadows } = resort();
    world.add(placement);
    const blob = blobOf(placement);
    if (blob) shadows.add(blob);
    lighting.add(placement);
  };

  let sites: readonly ConstructionSite[] = [];

  const redrawSites = (): void => {
    const { construction } = resort();
    for (const site of sites) {
      construction.show(site.placement, site.height, revealHeightOf(progressOf(site), site.height));
    }
  };

  const cancelSite = (key: string): boolean => {
    if (!resort().construction.hide(key)) return false;
    sites = sites.filter((site) => site.placement.key !== key);
    return true;
  };

  // Every effect here must be mirrored by lift; raise holds the ones that wait for the building to
  // finish.
  const standPaid = (placement: Placement, due: number, lifted?: Placement): void => {
    const { plot, construction } = resort();
    if (lifted) lift(lifted);
    // Claimed first: if the tiles are gone the scene must not gain an object the index does not
    // know.
    occupancy.claim(placement, placement.key);
    parts.money.spend('build', due);
    listFor(plot, placement.id).push(placement);
    // Whether or not it takes time: the ground under what stands is square from the moment the
    // tiles are claimed.
    if (reshapesGround(placement)) parts.onGroundChange();
    const seconds = buildTimeOf(placement, lifted);
    if (seconds > 0) {
      const height = objectTypeTop(placement.id);
      sites = [...sites, openSite(placement, height, seconds)];
      construction.show(placement, height, revealHeightOf(0, height));
    } else {
      raise(placement);
    }
    onChange();
  };

  // Refused before anything moves: a tile left unpaved re-lays no neighbour. Uncued for the
  // bulldozer's, which re-lays what a removal leaves behind.
  const standing =
    (cued: boolean) =>
    (placement: Placement, lifted?: Placement): void => {
      const due = costToStand(placement.id, lifted !== undefined);
      if (!parts.money.canAfford(due)) return parts.onRefused({ kind: 'money', id: placement.id });
      standPaid(placement, due, lifted);
      if (cued) parts.onCue(pavingIds.has(placement.id) ? 'pave' : 'place');
    };
  const stand = standing(true);

  // Land first: a footprint off the edge says so, rather than complaining about the gate's facing.
  const blocked = (placement: Placement): void => {
    if (!ownsFootprint(placement)) parts.onRefused({ kind: 'land' });
    else if (!fitsEdge(placement)) parts.onRefused({ kind: 'gate' });
  };

  const pointer = createBuildPointer({
    canvas,
    // Read per pick: the isometric view puts a different camera on screen.
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('object'),
    takeFinger: lendFinger,
    ghost,
    occupancy,
    ground,
    paving,
    handrails,
    owns: (tile) => owns(tile.x, tile.z),
    fits: fitsEdge,
    onPlace: stand,
    onRepave(placement, lifted) {
      const due = buildCostOf(placement.id);
      if (!parts.money.canAfford(due)) return parts.onRefused({ kind: 'money', id: placement.id });
      // Asked before standPaid lifts it, which cancels the site, as the bulldozer does.
      const stillBuilding = sites.some((site) => site.placement.key === lifted.key);
      standPaid(placement, due, lifted);
      parts.money.refund(refundOf(lifted.id, stillBuilding));
      parts.onCue('pave');
    },
    onBlocked: blocked,
    onRails: changeRails,
    onCancel,
    onFallback: parts.onFallback,
    onPending: parts.onPending,
  });

  const terrainRules: TerrainRules = {
    get terrain() {
      return resort().terrain;
    },
    isClear: (tileX, tileZ) => occupancy.keyAt({ x: tileX, z: tileZ }) === undefined,
    owns,
  };

  const spade = createTerrainPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('terrain'),
    takeFinger: lendFinger,
    ghost,
    ground,
    rules: terrainRules,
    handrails,
    onRails: changeRails,
    onDig(tile, next) {
      if (!parts.money.canAfford(DIG_COST)) {
        parts.onRefused({ kind: 'money', id: null });
        return;
      }
      resort().terrain.set(tile.x, tile.z, next);
      parts.money.spend('dig', DIG_COST);
      parts.onCue('dig');
      // Separate from onChange: the HUD counts are unchanged, but the terrain meshes must be
      // rebuilt.
      parts.onGroundChange();
    },
    onCancel,
  });

  // Free: a zone is paint on the plan, not a change to the ground.
  const zoneBrush = createZonePointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('zone'),
    takeFinger: lendFinger,
    ghost,
    ground,
    onPaint(tile, zone) {
      if (paintZone(resort().zones, tile.x, tile.z, zone, owns)) parts.onZonesChange();
    },
    onCancel,
  });

  const surveyor = createLandPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('land'),
    takeFinger: lendFinger,
    ghost,
    ground,
    ...parts.land,
    onCancel,
    onPending: parts.onPending,
  });

  // A scan rather than a second key table, which every edit would have to keep in step.
  const placementOf = (key: string): Placement | undefined => {
    const { plot } = resort();
    for (const list of [plot.placements, plot.props, plot.paths]) {
      const found = list.find((placement) => placement.key === key);
      if (found) return found;
    }
    return undefined;
  };

  const bulldozer = createDemolishPointer({
    canvas,
    camera: () => handle.camera,
    takeLeftButton: lendLeftButton('remove'),
    takeFinger: lendFinger,
    ghost,
    occupancy,
    ground,
    paving,
    handrails,
    placementOf,
    onDemolish(placement) {
      // Asked before lift, which cancels the site.
      const stillBuilding = sites.some((site) => site.placement.key === placement.key);
      lift(placement);
      parts.money.refund(refundOf(placement.id, stillBuilding));
      if (reshapesGround(placement)) parts.onGroundChange();
      onChange();
      parts.onCue('demolish');
    },
    onPlace: standing(false),
    onRails: changeRails,
    onCancel,
  });

  let armedFamily: string | null = null;

  return {
    select(tool) {
      // Every pointer is told every time, so the order cannot matter.
      const family = armedObject(tool);
      const chooser = itemChooser(tool, Math.random);
      if (chooser && family === armedFamily) pointer.restyle(chooser);
      else pointer.select(chooser);
      armedFamily = family;
      spade.select(armedBrush(tool));
      zoneBrush.select(armedZone(tool));
      bulldozer.select(armedRemove(tool));
      surveyor.select(armedLand(tool));
    },
    advance(dt) {
      if (sites.length === 0) return;
      const tick = advanceSites(sites, dt);
      sites = tick.sites;
      redrawSites();
      for (const site of tick.finished) {
        cancelSite(site.placement.key);
        raise(site.placement);
      }
      if (tick.finished.length === 0) return;
      onChange();
      parts.onCue('built');
    },
    abandon() {
      sites = [];
    },
    finishAll() {
      const open = sites;
      for (const site of open) {
        cancelSite(site.placement.key);
        raise(site.placement);
      }
      if (open.length > 0) onChange();
    },
    openSites: () => sites,
    // The inverse of raise, then the site drawn as it was.
    reopen(open) {
      const { world, lighting, shadows } = resort();
      for (const site of open) {
        world.remove(site.placement.key);
        lighting.unlight(site.placement);
        lighting.unshade(site.placement);
        shadows.remove(site.placement.key);
      }
      sites = open;
      redrawSites();
    },
    ground,
    placementOf,
    // Both are told: only the armed one holds a placement, and an idle stroke ignores it.
    confirm() {
      pointer.confirm();
      surveyor.confirm();
    },
    dismiss() {
      pointer.dismiss();
      surveyor.dismiss();
    },
    turn: (quarters) => pointer.turn(quarters),
    dispose() {
      pointer.dispose();
      spade.dispose();
      zoneBrush.dispose();
      bulldozer.dispose();
      surveyor.dispose();
      handle.scene.remove(ghost.group);
      ghost.dispose();
    },
  };
}

// A null id is the ground.
export type Refusal =
  | { kind: 'money'; id: string | null }
  | { kind: 'parcel'; price: number }
  | { kind: 'land' }
  | { kind: 'gate' };
