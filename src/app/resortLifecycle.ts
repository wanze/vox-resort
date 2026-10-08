import type { ResortParams } from '../features/layout/domain/resortGenerator';
import type {
  PrepRequest,
  PreparedResort,
  ResortSource,
} from '../features/resort-prep/domain/prepareResort';
import { savedWorldOf } from '../features/resort-prep/domain/savedWorld';
import type { ResortPreparer } from '../features/resort-prep/adapters/resortPreparer';
import type { OwnershipMask } from '../features/land/adapters/ownershipMask';
import { widenGame } from '../features/saves/domain/widenGame';
import {
  SAVE_VERSION,
  type CameraSnapshot,
  type GameSnapshot,
} from '../features/saves/domain/snapshot';
import { snapshotResort } from '../features/sim/domain/resortState';
import { createLedger, OPENING_BALANCE, type GameMode } from '../features/sim/domain/ledger';
import type { SimSpeed } from '../features/sim/domain/simClock';
import { snapshotEvents } from '../features/events/domain/eventsSnapshot';
import { snapshotCrowd } from '../features/crowd/domain/crowd';
import { savedResortName } from '../features/naming/domain/resortName';
import type { FireworksField } from '../features/fireworks/adapters/fireworksField';
import type { SceneHandle } from '../features/rendering/adapters/threeScene';
import type { EditMode } from '../features/build/adapters/editMode';
import type { BenchConfig } from '../features/bench/domain/benchConfig';
import type { SelectionController } from './selectionController';
import type { Clock, Resort, ResortSlot } from './showcase';

// Late afternoon, so day 0 opens in daylight.
export const INITIAL_TIME = 0.62;

// Long enough that a drag costs one rebuild, short enough to read as immediate.
const REANCHOR_DELAY_MS = 250;

const undressed = (): void => {};

// Long enough for a strip of parcels bought one click at a time to settle once.
const SETTLE_DELAY_MS = 2_000;

export function prepRequestFor(source: ResortSource, bench: BenchConfig | null): PrepRequest {
  if (!bench) return { source, repeat: 1, view: null };
  return {
    source,
    repeat: bench.repeat,
    view: bench.view,
    ...(bench.styles ? { styles: bench.styles } : {}),
    ...(bench.mosaic ? { mosaic: true } : {}),
  };
}

export function cameraOf(handle: SceneHandle): CameraSnapshot {
  const { position, zoom } = handle.camera;
  const { target } = handle.controls;
  return {
    mode: handle.cameraMode,
    isoDirection: handle.isoDirection,
    target: { x: target.x, y: target.y, z: target.z },
    position: { x: position.x, y: position.y, z: position.z },
    zoom,
  };
}

// Mode and direction first, as each re-stands the camera; the saved position then wins.
export function restoreCamera(handle: SceneHandle, camera: CameraSnapshot): void {
  handle.setIsoDirection(camera.isoDirection);
  handle.setCameraMode(camera.mode);
  handle.lookAt(camera.target);
  handle.camera.position.set(camera.position.x, camera.position.y, camera.position.z);
  handle.camera.zoom = camera.zoom;
  handle.camera.updateProjectionMatrix();
  handle.controls.update();
}

// Kept beside the resort rather than in it, so a settle or a load of the scene keeps them.
export interface ResortIdentity {
  params: ResortParams;
  name: string;
}

interface LifecycleParts {
  readonly preparer: Pick<ResortPreparer, 'prepare'>;
  readonly bench: BenchConfig | null;
  readonly slot: ResortSlot;
  readonly handle: SceneHandle;
  readonly clock: Clock;
  readonly fireworks: Pick<FireworksField, 'clear'>;
  readonly ownership: Pick<OwnershipMask, 'update'>;
  readonly build: Pick<EditMode, 'abandon' | 'finishAll' | 'openSites' | 'reopen'>;
  readonly selection: Pick<SelectionController, 'select'>;
  readonly running: () => boolean;
  // Shared with the showcase, whose lettering and renaming read it too.
  readonly identity: ResortIdentity;
  readonly populationOf: (prepared: PreparedResort) => number;
  readonly restoreGame: (resort: Resort, saved: GameSnapshot) => void;
  readonly reanchor: () => void;
  // Ends a follow first, which hands the camera back to the player.
  readonly beforeReplace: () => void;
  // The player's own camera while a follow has taken it over, so neither a save nor a settle keeps
  // a guest's view.
  readonly heldCamera: () => CameraSnapshot | null;
  readonly openIsometric: () => void;
  readonly stopDrift: () => void;
  // Letters and tells the HUD everything of the resort now standing.
  readonly rebuilt: () => void;
  readonly onResortReplaced: () => void;
  readonly onSpeedChange: (speed: SimSpeed) => void;
}

export interface ResortLifecycle {
  regrow(
    asked: ResortParams,
    source: ResortSource,
    mode: GameMode,
    dress?: (resort: Resort) => void,
  ): Promise<void>;
  load(saved: GameSnapshot): Promise<void>;
  snapshot(): GameSnapshot;
  // The plot's lists changed: the walk graph catches up once the pointer has rested.
  edited(): void;
  // Anything else a settle's prepared world would miss.
  groundEdited(): void;
  scheduleSettle(): void;
  // A settle already waiting runs now.
  settleNow(): void;
  reanchorDue(timeMs: number): boolean;
  reanchor(): void;
  dispose(): void;
}

export function createResortLifecycle(parts: LifecycleParts): ResortLifecycle {
  const { preparer, bench, slot, handle, clock, build, selection, identity } = parts;
  const current = slot.current;

  // Deferred until the pointer is still for REANCHOR_DELAY_MS, so a whole stroke costs one rebuild.
  let walkStaleAt: number | null = null;

  // Bumped by anything a settle's prepared world would miss, so a settle overtaken by an edit is
  // thrown away rather than undoing it.
  let edits = 0;

  let requested = 0;

  const reanchor = (): void => {
    walkStaleAt = null;
    parts.reanchor();
  };

  const playerCamera = (): CameraSnapshot => parts.heldCamera() ?? cameraOf(handle);

  // Told at once, so a save that fails to restore still leaves the next advice a baseline.
  const replaceResort = (prepared: PreparedResort, population?: number): Resort => {
    parts.beforeReplace();
    const resort = slot.replace(prepared, population);
    parts.fireworks.clear();
    parts.ownership.update(resort.rights, resort.plan);
    parts.onResortReplaced();
    return resort;
  };

  // An answer overtaken by a later request is dropped rather than flashed on screen.
  const regrow = async (
    asked: ResortParams,
    source: ResortSource,
    mode: GameMode,
    dress: (resort: Resort) => void = undressed,
  ): Promise<void> => {
    cancelSettle();
    const request = ++requested;
    const prepared = await preparer.prepare(prepRequestFor(source, bench));
    if (request !== requested || !parts.running()) return;
    identity.params = asked;
    build.abandon();
    // The person index and the placement key both name something on the old plot.
    selection.select(null);
    walkStaleAt = null;
    const resort = replaceResort(prepared);
    resort.ledger = createLedger(mode, OPENING_BALANCE[mode]);
    // Before the lettering and the signs, so they show what dress gave the resort.
    dress(resort);
    parts.openIsometric();
    parts.stopDrift();
    clock.restart(INITIAL_TIME);
    parts.rebuilt();
  };

  const snapshot = (): GameSnapshot => {
    build.finishAll();
    return gameNow();
  };

  // Without raising the open sites, which a settle carries over still going up.
  const gameNow = (): GameSnapshot => {
    if (walkStaleAt !== null) reanchor();
    return gameOf(current());
  };

  const gameOf = (resort: Resort): GameSnapshot => {
    return {
      version: SAVE_VERSION,
      world: savedWorldOf(resort.plan, resort.terrain, resort.plot, resort.rights),
      params: identity.params,
      name: identity.name,
      population: resort.guests.count,
      staffCount: resort.staffPool.count,
      resort: snapshotResort(resort),
      router: resort.router.snapshot(),
      staffRouter: resort.staffRouter.snapshot(),
      events: snapshotEvents(resort.events),
      crowd: snapshotCrowd(resort.crowd.crowd),
      staff: snapshotCrowd(resort.staff.crowd),
      clock: clock.snapshot(),
      camera: playerCamera(),
    };
  };

  // Mirrors regrow.
  const load = async (saved: GameSnapshot): Promise<void> => {
    cancelSettle();
    const request = ++requested;
    const prepared = await preparer.prepare(
      prepRequestFor({ kind: 'saved', world: saved.world }, bench),
    );
    if (request !== requested || !parts.running()) return;
    build.abandon();
    selection.select(null);
    walkStaleAt = null;
    const resort = replaceResort(prepared, saved.population);
    parts.restoreGame(resort, saved);
    clock.setSpeed('paused');
    parts.stopDrift();
    // After the replace, whose reframe has put the camera back where a new plot is looked at from.
    restoreCamera(handle, saved.camera);
    identity.params = saved.params;
    identity.name = savedResortName(saved.name, saved.params.seed);
    parts.rebuilt();
    parts.onSpeedChange('paused');
  };

  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let settling = false;

  const cancelSettle = (): void => {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = null;
  };

  const scheduleSettle = (): void => {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => void settle(), SETTLE_DELAY_MS);
  };

  // A rebuild that keeps the game, so the lighting, the beach and the guests catch up with the land
  // bought. The world is prepared first and the game taken after, so nothing played meanwhile is lost.
  // A load or a new game since the settle began has the last word.
  const stillCurrent = (request: number, before: Resort): boolean =>
    request === requested && current() === before && parts.running();

  // One at a time: a purchase made while one prepares moves `edits`, and that one reschedules.
  const settle = async (): Promise<void> => {
    cancelSettle();
    if (settling) return;
    settling = true;
    const started = edits;
    // Not bumped: a settle must never drop a load or a new game, only be dropped by one.
    const request = requested;
    const before = current();
    const world = savedWorldOf(before.plan, before.terrain, before.plot, before.rights);
    const prepared = await preparer
      .prepare(prepRequestFor({ kind: 'saved', world }, bench))
      .finally(() => {
        settling = false;
      });
    if (!stillCurrent(request, before)) return;
    if (edits === started) settleOnto(prepared);
    else scheduleSettle();
  };

  const settleOnto = (prepared: PreparedResort): void => {
    const replaceStarted = performance.now();
    const saved = gameNow();
    const camera = playerCamera();
    const sites = build.openSites();
    const population = Math.max(saved.population, parts.populationOf(prepared));
    build.abandon();
    selection.select(null);
    walkStaleAt = null;
    const resort = replaceResort(prepared, population);
    parts.restoreGame(
      resort,
      population > saved.population ? widenGame(saved, gameOf(resort)) : saved,
    );
    build.reopen(sites);
    restoreCamera(handle, camera);
    parts.rebuilt();
    console.info(
      `Settled the land in ${prepared.prepMs} ms on the worker and ${Math.round(performance.now() - replaceStarted)} ms here, for ${population} guests`,
    );
  };

  return {
    regrow,
    load,
    snapshot,
    edited() {
      walkStaleAt = performance.now();
      edits++;
    },
    groundEdited() {
      edits++;
    },
    scheduleSettle,
    settleNow() {
      if (settleTimer !== null) void settle();
    },
    // Never under a bench, so one that ever places something does not rebuild mid-run.
    reanchorDue: (timeMs) =>
      walkStaleAt !== null && !bench && timeMs - walkStaleAt >= REANCHOR_DELAY_MS,
    reanchor,
    dispose: cancelSettle,
  };
}
