import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { previewUrl } from '../features/catalog/adapters/previews';
import { createHudOverlay } from '../features/hud/adapters/hudOverlay';
import { markersOf } from '../features/hud/domain/markers';
import { Hud } from '../features/hud/components/Hud';
import { WelcomeScreen } from '../features/welcome/components/WelcomeScreen';
import type { LoadingStep } from '../features/welcome/domain/loading';
import type { NewGame } from '../features/welcome/domain/newGame';
import type { ResortParams } from '../features/layout/domain/resortGenerator';
import { parseBenchConfig } from '../features/bench/domain/benchConfig';
import { useHudNodes } from './useHudNodes';
import { useCameraControls } from './useCameraControls';
import { useClockControls, type ClockControls } from './useClockControls';
import { useAdvice } from './useAdvice';
import { useHistory } from './useHistory';
import { useNews } from './useNews';
import { useStatus } from './useStatus';
import { useThoughts } from './useThoughts';
import { useInspector } from './useInspector';
import { useOverlay } from './useOverlay';
import { useResortControls } from './useResortControls';
import { useHudChrome } from './useHudChrome';
import { useSaves, type SaveControls } from './useSaves';
import { mountShowcase, type Showcase, type ShowcaseStats } from './showcase';
import { armedZone, type BuildTool, type StylePick } from '../features/build/domain/buildTool';
import type { OverlayKind } from '../features/overlays/domain/overlays';
import { armWithMemory } from '../features/build/domain/stylePick';
import type { GameSnapshot } from '../features/saves/domain/snapshot';
import type { SimSpeed } from '../features/sim/domain/simClock';

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
  saves: SaveControls,
  setPlaying: (playing: boolean) => void,
) {
  const resort = useResortControls(showcase, saves.started);
  const { start } = resort;
  const { load } = saves;
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
  return { resort, loaded, ready: loaded.includes('scene'), adoptLoading, startGame, loadGame };
}

// The saves are made before the resort's controls, which tell them when a game starts, so the
// params a load brings are handed over late.
function useGame(showcase: RefObject<Showcase | null>, clock: ClockControls) {
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
  const welcome = useWelcome(showcase, saves, setPlaying);
  const { adopt: adoptParams } = welcome.resort;
  useEffect(() => {
    adoptParamsRef.current = adoptParams;
  }, [adoptParams]);
  return { playing, saves, welcome };
}

// Together because the advice and the day's report are what the news is heard from, and a new
// resort is a baseline for both.
function useAdviceNews(showcase: RefObject<Showcase | null>, speed: SimSpeed) {
  const news = useNews(speed);
  const history = useHistory(news.closeDay);
  const { reset: resetNews } = news;
  const { reset: resetHistory } = history;
  const replaced = useCallback(() => {
    resetNews();
    resetHistory();
  }, [resetNews, resetHistory]);
  const advice = useAdvice(showcase, news.hear);
  const shown = news.prefs.markers;
  // markersOf on the same list ProblemMarkers renders, so the anchors and the buttons line up.
  useEffect(() => {
    showcase.current?.setMarkers(shown ? markersOf(advice.advice).map((marker) => marker.at) : []);
  }, [showcase, advice.advice, shown]);
  return { news, history, replaced, advice };
}

function useHourly() {
  return { thoughts: useThoughts(), status: useStatus() };
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudNodes = useHudNodes();
  const showcaseRef = useRef<Showcase | null>(null);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapOverlay = useOverlay(showcaseRef);
  const {
    tool,
    select: selectTool,
    pending: toolRef,
  } = useBuildTool(showcaseRef, mapOverlay.setOverlay);
  const camera = useCameraControls(showcaseRef);
  const clock = useClockControls(showcaseRef);
  const inspector = useInspector(showcaseRef);
  const { news, history, replaced, advice } = useAdviceNews(showcaseRef, clock.speed);
  const { thoughts, status } = useHourly();
  const { playing, saves, welcome } = useGame(showcaseRef, clock);
  const { resort, adoptLoading } = welcome;
  const { windows, menu, setMenu, palette, setPalette } = useHudChrome(
    clock,
    tool,
    selectTool,
    inspector.selection,
    playing,
    saves,
  );
  // The setters are stable but the objects holding them are not; depending on those would tear the
  // renderer down on every render.
  const { adopt: adoptParams, adoptOpen, money } = resort;
  const { adopt: adoptCamera } = camera;
  const { adopt: adoptSelection } = inspector;
  const { adopt: adoptAdvice, show: showAdvice } = advice;
  const { adopt: adoptHistory } = history;
  const { adopt: adoptVoices } = thoughts;
  const { adopt: adoptStatus } = status;
  const { adoptWeather, adoptSpeed } = clock;
  const { adopt: adoptLedger, refuse } = money;
  const { markDirty, morning } = saves;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    // The render loop writes to the DOM through the overlay; React only holds state that changes rarely.
    const overlay = createHudOverlay(hudNodes);

    const options = {
      canvas,
      onSceneChange: setStats,
      onToolChange: selectTool,
      onCameraChange: adoptCamera,
      onSelectionChange: adoptSelection,
      onAdviceChange: adoptAdvice,
      onResortReplaced: replaced,
      onThoughtsChange: adoptVoices,
      onStatusChange: adoptStatus,
      onHistoryChange: adoptHistory,
      onWeatherChange: adoptWeather,
      onOpenChange: adoptOpen,
      onMoneyChange: adoptLedger,
      onRefused: refuse,
      onFrame: overlay.update,
      onLoading: adoptLoading,
      onDirty: markDirty,
      onMorning: morning,
      onSpeedChange: adoptSpeed,
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
        setStats(mounted.stats);
        // So the panel says something before the first check-in hour comes round.
        showAdvice(mounted.advice);
        adoptVoices(mounted.voices);
        adoptStatus(mounted.status);
        adoptHistory(mounted.history);
        adoptCamera(mounted.cameraView);
        adoptParams(mounted.params);
        adoptOpen(mounted.open);
        adoptLedger(mounted.ledger);
        // So the bar says what kind of day it is before midnight comes round.
        adoptWeather(mounted.stats.weather);
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
    hudNodes,
    selectTool,
    toolRef,
    adoptParams,
    adoptOpen,
    adoptCamera,
    adoptSelection,
    adoptAdvice,
    showAdvice,
    replaced,
    adoptVoices,
    adoptStatus,
    adoptHistory,
    adoptWeather,
    adoptLedger,
    adoptLoading,
    refuse,
    markDirty,
    morning,
    adoptSpeed,
  ]);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app-canvas" />
      <Screen
        playing={playing}
        welcome={
          <WelcomeScreen
            loaded={welcome.loaded}
            ready={welcome.ready}
            error={error}
            params={resort.params}
            busy={resort.building}
            onStart={welcome.startGame}
            saves={saves}
            onLoad={welcome.loadGame}
          />
        }
      >
        <Hud
          stats={stats}
          debugElements={hudNodes}
          timeElement={hudNodes.time}
          clockElement={hudNodes.clock}
          clock={clock}
          camera={camera}
          resort={resort}
          saves={saves}
          overlay={mapOverlay}
          advice={advice.advice}
          news={news}
          voices={thoughts.voices}
          status={status.status}
          history={history}
          onShowOnPlot={advice.showOnPlot}
          markerElements={hudNodes.markers}
          onSelectAt={inspector.selectAt}
          preview={previewUrl}
          tool={tool}
          onToolChange={selectTool}
          selection={inspector.selection}
          inspectElement={hudNodes.inspect}
          onSelectPerson={inspector.selectPerson}
          onClearSelection={inspector.clear}
          error={error}
          refusal={money.refusal}
          ledger={money.ledger}
          windows={windows}
          menu={menu}
          onMenuChange={setMenu}
          palette={palette}
          onPaletteChange={setPalette}
        />
      </Screen>
    </div>
  );
}
