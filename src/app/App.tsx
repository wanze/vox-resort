import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { previewUrl } from '../features/catalog/adapters/previews';
import { createHudOverlay } from '../features/hud/adapters/hudOverlay';
import { markersOf } from '../features/hud/domain/markers';
import { updateOnly, type UpdatePhase } from '../features/hud/domain/news';
import { Hud } from '../features/hud/components/Hud';
import { Toasts } from '../features/hud/components/Toasts';
import { WelcomeScreen } from '../features/welcome/components/WelcomeScreen';
import type { LoadingStep } from '../features/welcome/domain/loading';
import type { NewGame } from '../features/welcome/domain/newGame';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { parseBenchConfig } from '../features/bench/domain/benchConfig';
import { useHudNodes } from './useHudNodes';
import { useCameraControls } from './useCameraControls';
import { useClockControls } from './useClockControls';
import { useAdvice } from './useAdvice';
import { useHistory } from './useHistory';
import { useNews } from './useNews';
import { useInspector } from './useInspector';
import { useGuestView } from './useGuestView';
import { useOverlay } from './useOverlay';
import { useProgramme } from './useProgramme';
import { useResortControls } from './useResortControls';
import { useHudChrome } from './useHudChrome';
import { useSaves } from './useSaves';
import { useSigns } from './useSigns';
import { useHighlights } from './useHighlights';
import { useClickCues, useSound, useToastCues } from './useSound';
import { useUpdate } from './useUpdate';
import { useIncomingLink, useShareLink } from './useSharing';
import { usePhotoMode } from './usePhotoMode';
import { PhotoBar } from '../features/photo/components/PhotoBar';
import { PhotoFilterDefs } from '../features/photo/components/PhotoFilterDefs';
import { PhotoViewfinder } from '../features/photo/components/PhotoViewfinder';
import { isCompact, type LayoutMode } from '../features/hud/domain/layoutMode';
import type { PhotoControls } from '../features/photo/components/photoControls';
import type { SharedResort } from '../features/sharing/domain/sharedResort';
import { mountShowcase, type Showcase } from './showcase';
import {
  armedLand,
  armedZone,
  type BuildTool,
  type StylePick,
} from '../features/build/domain/buildTool';
import type { LandView } from '../features/land/domain/landRights';
import type { OverlayKind } from '../features/overlays/domain/overlays';
import { armWithMemory } from '../features/build/domain/stylePick';
import type { GameSnapshot } from '../features/saves/domain/snapshot';
import type { SimSpeed } from '../features/sim/domain/simClock';
import type { Toast } from '../features/hud/domain/news';
import type {
  ClockControls,
  GuestViewControls,
  SoundControls,
} from '../features/hud/components/hudControls';
import type { SelectionView } from '../features/inspect/domain/selection';
import type { BuildNote } from '../features/hud/domain/views';
import { createHudStore, type HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type { SaveControls } from '../features/saves/components/saveControls';

const GAME_TITLE = 'Vox Resort';

// A benchmark measures the game itself, so it skips the welcome screen.
const OPENS_ON_WELCOME = parseBenchConfig(globalThis.location?.search ?? '') === null;

// Serialised so StrictMode's double-invoked effect never puts two renderers on the same canvas.
let lifecycle: Promise<void> = Promise.resolve();

function useBuildTool(
  showcase: RefObject<Showcase | null>,
  setOverlay: (kind: OverlayKind | null) => void,
) {
  // So a tool picked while the catalogue is still meshing is armed once the scene exists.
  const pending = useRef<BuildTool | null>(null);
  const [tool, setTool] = useState<BuildTool | null>(null);
  // For the session only: a saved game does not bring back the styles its builder liked.
  const styles = useRef<ReadonlyMap<string, StylePick>>(new Map());
  const select = useCallback(
    (next: BuildTool | null) => {
      const armed = armWithMemory(next, styles.current);
      styles.current = armed.memory;
      pending.current = armed.tool;
      setTool(armed.tool);
      showcase.current?.selectTool(armed.tool);
      // The showcase puts the map away itself; this keeps the map picker saying so.
      if (armedZone(armed.tool) !== null) setOverlay(null);
    },
    [showcase, setOverlay],
  );
  return { tool, select, pending };
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

// The HUD is built only once playing: behind the welcome screen there is nothing for it to show.
function Screen(props: {
  readonly playing: boolean;
  readonly welcome: ReactNode;
  readonly children: ReactNode;
}) {
  return props.playing ? props.children : props.welcome;
}

// With the resort's controls, because starting or loading a game is what ends the welcome screen:
// it gives way to the HUD once the resort stands.
function useWelcome(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  saves: SaveControls,
  setPlaying: (playing: boolean) => void,
) {
  const resort = useResortControls(showcase, hud, saves.started);
  const { start, openShared: openResort } = resort;
  const { load } = saves;
  const incoming = useIncomingLink(OPENS_ON_WELCOME);
  const { dismiss: dismissShared } = incoming;
  const [sharedFailed, setSharedFailed] = useState(false);
  const [loaded, setLoaded] = useState<readonly LoadingStep[]>([]);
  const adoptLoading = useCallback((step: LoadingStep) => setLoaded((done) => [...done, step]), []);
  const startGame = useCallback(
    (params: ResortParams, game: NewGame) =>
      void start(params, game).then((built) => built && setPlaying(true)),
    [start, setPlaying],
  );
  const loadGame = useCallback(
    (id: string) => void load(id).then((running) => running && setPlaying(true)),
    [load, setPlaying],
  );
  const openShared = useCallback(
    (shared: SharedResort) => {
      setSharedFailed(false);
      void openResort(shared).then((built) => {
        if (!built) {
          setSharedFailed(true);
          return;
        }
        dismissShared();
        setPlaying(true);
      });
    },
    [openResort, dismissShared, setPlaying],
  );
  return {
    resort,
    loaded,
    ready: loaded.includes('scene'),
    adoptLoading,
    startGame,
    loadGame,
    incoming,
    sharedFailed,
    openShared,
  };
}

// The game's name alone behind the welcome screen, where no resort is being played yet.
function useDocumentTitle(playing: boolean, name: string | null): void {
  useEffect(() => {
    document.title = playing && name !== null ? `${name} · ${GAME_TITLE}` : GAME_TITLE;
  }, [playing, name]);
}

// The saves are made before the resort's controls, which tell them when a game starts, so the
// params a load brings are handed over late.
function useGame(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  clock: ClockControls,
  setUpdate: (phase: UpdatePhase | null) => void,
  failed: boolean,
) {
  const [playing, setPlaying] = useState(!OPENS_ON_WELCOME);
  const { adoptForced } = clock;
  const adoptParamsRef = useRef<(params: ResortParams) => void>(() => {});
  const onLoaded = useCallback(
    (snapshot: GameSnapshot) => {
      adoptForced(snapshot.clock.forced);
      adoptParamsRef.current(snapshot.params);
    },
    [adoptForced],
  );
  const saves = useSaves(showcase, playing, onLoaded);
  const welcome = useWelcome(showcase, hud, saves, setPlaying);
  const { adopt: adoptParams } = welcome.resort;
  useEffect(() => {
    adoptParamsRef.current = adoptParams;
  }, [adoptParams]);
  const onUpdate = useUpdate(saves.saveBeforeReload, setUpdate, welcome.ready || failed);
  const share = useShareLink(showcase);
  useDocumentTitle(playing, welcome.resort.name);
  return { playing, saves, welcome, onUpdate, share };
}

// Together because the advice and the day's report are what the news is heard from, and a new
// resort is a baseline for both.
// sceneUp, so the staff pins, signs and highlights asked for at startup are not told to nobody.
function useAdviceNews(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  speed: SimSpeed,
  sceneUp: boolean,
) {
  const news = useNews(speed);
  const { hear } = news;
  // Watched before the history, so a morning's advice is heard before its day is closed.
  useEffect(
    () =>
      hud.watch(
        (state) => state.advice,
        (advice) => hear(advice.list, advice.ticks),
      ),
    [hud, hear],
  );
  const history = useHistory(hud, news.closeDay);
  const { reset: resetNews } = news;
  const { reset: resetHistory } = history;
  const replaced = useCallback(() => {
    resetNews();
    resetHistory();
  }, [resetNews, resetHistory]);
  const advice = useAdvice(showcase, hud);
  const shown = news.prefs.markers;
  // markersOf on the same list ProblemMarkers renders, so the anchors and the buttons line up.
  useEffect(() => {
    showcase.current?.setMarkers(shown ? markersOf(advice.advice).map((marker) => marker.at) : []);
  }, [showcase, advice.advice, shown]);
  const staffPins = news.prefs.staff;
  useEffect(() => {
    if (sceneUp) showcase.current?.setStaffPins(staffPins);
  }, [showcase, sceneUp, staffPins]);
  const singleKeys = news.prefs.singleKeys;
  useEffect(() => {
    if (sceneUp) showcase.current?.setSingleKeys(singleKeys);
  }, [showcase, sceneUp, singleKeys]);
  const signs = useSigns(showcase, sceneUp, news.prefs.signs);
  const highlights = useHighlights(showcase, hud, sceneUp);
  return { news, history, replaced, advice, signs, highlights };
}

function usePlacement(showcase: RefObject<Showcase | null>, hud: HudStore) {
  const pending = useHudSlice(hud, (state) => state.pending);
  const confirm = useCallback(() => showcase.current?.confirmPlacement(), [showcase]);
  const dismiss = useCallback(() => showcase.current?.dismissPlacement(), [showcase]);
  const turn = useCallback(
    (quarters: number) => showcase.current?.turnPlacement(quarters),
    [showcase],
  );
  return { pending, confirm, dismiss, turn };
}

function useControls(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
  selectTool: (tool: BuildTool | null) => void,
) {
  const clock = useClockControls(showcase, hud);
  const guestView = useGuestView(showcase, hud);
  return {
    camera: useCameraControls(showcase, hud),
    clock,
    inspector: useInspector(showcase, hud),
    guestView,
    placement: usePlacement(showcase, hud),
    programme: useProgramme(showcase, hud),
    photo: usePhotoMode(showcase, { clock, selectTool, following: guestView.following, hud }),
  };
}

// The cues the showcase's own events carry, beside what they already do.
function useSoundCues(
  sound: SoundControls,
  told: { readonly note: (note: BuildNote) => void; readonly morning: () => void },
  toasts: readonly Toast[],
) {
  const { cue } = sound;
  const { note, morning } = told;
  useClickCues(cue);
  useToastCues(cue, toasts);
  const onRefused = useCallback(
    (refusal: BuildNote) => {
      note(refusal);
      cue('refused');
    },
    [note, cue],
  );
  const onMorning = useCallback(() => {
    morning();
    cue('morning');
  }, [morning, cue]);
  return { onRefused, onMorning };
}

// None while nothing is for sale, so the key does nothing on a plot that owns all of itself.
function landToggle(
  land: LandView | null,
  tool: BuildTool | null,
  selectTool: (tool: BuildTool | null) => void,
): (() => void) | null {
  if (!land || land.forSale === 0) return null;
  return () => selectTool(armedLand(tool) ? null : { kind: 'land' });
}

const inspecting = (selection: SelectionView | null, guestView: GuestViewControls): boolean =>
  selection !== null || guestView.following !== null;

// None while nothing is followed and no guest is inspected, so the key does nothing then.
function followToggle(
  guestView: GuestViewControls,
  selection: SelectionView | null,
): (() => void) | null {
  if (guestView.following !== null) return guestView.stop;
  return selection?.kind === 'guest' ? guestView.follow : null;
}

const photoFlag = (photo: PhotoControls): '' | undefined => (photo.on ? '' : undefined);

const photoFilterOf = (photo: PhotoControls): string | undefined =>
  photo.on ? photo.filter : undefined;

// Beside the HUD, not in it: photo mode hides the HUD.
function PhotoLayer(props: { readonly photo: PhotoControls; readonly layout: LayoutMode }) {
  if (!props.photo.on) return null;
  return (
    <>
      <PhotoFilterDefs />
      <PhotoViewfinder photo={props.photo} />
      <PhotoBar photo={props.photo} compact={isCompact(props.layout)} />
    </>
  );
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudNodes = useHudNodes();
  const showcaseRef = useRef<Showcase | null>(null);
  // Set once showcaseRef holds the scene: the store says the scene is up a little before that.
  const [sceneUp, setSceneUp] = useState(false);
  // Made before the showcase, so React is listening before anything is published.
  const [hud] = useState(createHudStore);
  const [error, setError] = useState<string | null>(null);
  const mapOverlay = useOverlay(showcaseRef);
  const {
    tool,
    select: selectTool,
    pending: toolRef,
  } = useBuildTool(showcaseRef, mapOverlay.setOverlay);
  const { camera, clock, inspector, guestView, placement, programme, photo } = useControls(
    showcaseRef,
    hud,
    selectTool,
  );
  const { news, history, replaced, advice, signs, highlights } = useAdviceNews(
    showcaseRef,
    hud,
    clock.speed,
    sceneUp,
  );
  const { playing, saves, welcome, onUpdate, share } = useGame(
    showcaseRef,
    hud,
    clock,
    news.setUpdate,
    error !== null,
  );
  const { resort, adoptLoading } = welcome;
  const sound = useSound(!playing);
  const { windows, layout, menu, setMenu, palette, setPalette, bar } = useHudChrome(
    clock,
    tool,
    selectTool,
    inspecting(inspector.selection, guestView),
    playing,
    saves,
    {
      staffPins: () => news.setStaffPins(!news.prefs.staff),
      signs: () => news.setSigns(!news.prefs.signs),
      sound: sound.toggle,
      land: landToggle(resort.money.land, tool, selectTool),
      follow: followToggle(guestView, inspector.selection),
    },
    news.prefs.singleKeys,
    photo,
  );
  // The setters are stable but the objects holding them are not; depending on those would tear the
  // renderer down on every render.
  const { adopt: adoptParams, money } = resort;
  const { adoptSpeed } = clock;
  const { note } = money;
  const { markDirty, morning } = saves;
  const { hearEvent } = news;
  const { onRefused, onMorning } = useSoundCues(sound, { note, morning }, news.toasts);
  const { cue: onCue, hear: onHear } = sound;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    // The render loop writes to the DOM through the overlay; React only holds state that changes rarely.
    const overlay = createHudOverlay(hudNodes);

    const options = {
      canvas,
      hud,
      onToolChange: selectTool,
      onResortReplaced: replaced,
      onRefused,
      onBuildNote: note,
      onFrame: overlay.update,
      onLoading: adoptLoading,
      onDirty: markDirty,
      onMorning,
      onCue,
      onHear,
      onSpeedChange: adoptSpeed,
      onEventNews: hearEvent,
      welcome: OPENS_ON_WELCOME,
    };

    lifecycle = lifecycle.then(async () => {
      if (disposed) return;
      try {
        const mounted = await mountShowcase(options);
        if (disposed) {
          mounted.dispose();
          return;
        }
        showcaseRef.current = mounted;
        mounted.selectTool(toolRef.current);
        adoptParams(mounted.params);
        setSceneUp(true);
      } catch (cause: unknown) {
        console.error(cause);
        setError(messageOf(cause));
      }
    });

    return () => {
      disposed = true;
      lifecycle = lifecycle.then(() => {
        showcaseRef.current?.dispose();
        showcaseRef.current = null;
      });
    };
    // All of them are stable, so the renderer is mounted exactly once.
  }, [
    hud,
    hudNodes,
    selectTool,
    toolRef,
    adoptParams,
    adoptLoading,
    replaced,
    note,
    onRefused,
    markDirty,
    onMorning,
    onCue,
    onHear,
    adoptSpeed,
    hearEvent,
  ]);

  return (
    <div className="app" data-layout={layout} data-photo={photoFlag(photo)}>
      <canvas ref={canvasRef} className="app-canvas" data-photo-filter={photoFilterOf(photo)} />
      <Screen
        playing={playing}
        welcome={
          <>
            <WelcomeScreen
              loaded={welcome.loaded}
              ready={welcome.ready}
              error={error}
              params={resort.params}
              busy={resort.building}
              onStart={welcome.startGame}
              saves={saves}
              onLoad={welcome.loadGame}
              shared={welcome.incoming.share}
              sharedFailed={welcome.sharedFailed}
              onOpenShared={welcome.openShared}
              onDismissShared={welcome.incoming.dismiss}
            />
            <Toasts toasts={updateOnly(news.toasts)} onUpdate={onUpdate} news={null} />
          </>
        }
      >
        <Hud
          hud={hud}
          nodes={hudNodes}
          controls={{
            clock,
            camera,
            resort,
            saves,
            overlay: mapOverlay,
            highlights,
            news,
            history,
            sound,
            programme,
            windows,
            guestView,
            photo,
          }}
          placement={{
            tool,
            onToolChange: selectTool,
            preview: previewUrl,
            onConfirm: placement.confirm,
            onDismiss: placement.dismiss,
            onTurn: placement.turn,
          }}
          inspector={inspector}
          chrome={{
            bar,
            layout,
            menu,
            onMenuChange: setMenu,
            palette,
            onPaletteChange: setPalette,
            error,
            refusal: money.refusal,
            onUpdate,
            onShare: share,
            signsNamed: signs.named,
            onShowOnPlot: advice.showOnPlot,
          }}
        />
      </Screen>
      <PhotoLayer photo={photo} layout={layout} />
    </div>
  );
}
