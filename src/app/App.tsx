import { useCallback, useEffect, useRef, useState } from "react";
import { createHudOverlay } from "../features/hud/adapters/hudOverlay";
import { Hud } from "../features/hud/components/Hud";
import { useHudNodes } from "./useHudNodes";
import { useResortControls } from "./useResortControls";
import { mountShowcase, type LabelAnchor, type Showcase, type ShowcaseStats } from "./showcase";

/**
 * Mount and dispose are serialised through this chain so React 19's StrictMode
 * double-invoked effect can never put two renderers on the same canvas.
 */
let lifecycle: Promise<void> = Promise.resolve();

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudNodes = useHudNodes();
  const showcaseRef = useRef<Showcase | null>(null);
  /** Mirrors the palette selection, so a type picked while the catalogue is
   * still being meshed is armed as soon as the scene exists. */
  const buildTypeRef = useRef<string | null>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [anchors, setAnchors] = useState<readonly LabelAnchor[]>([]);
  const [cycling, setCycling] = useState(false);
  const [buildType, setBuildType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resort = useResortControls(showcaseRef);
  // Pulled out because the mount effect depends on it: the setter React hands
  // back is stable, the object holding it is not, and depending on the object
  // would tear the renderer down on every render.
  const { adopt: adoptParams } = resort;

  /** Arms the pointer with a type, and keeps the palette showing which. */
  const selectBuildType = useCallback((typeId: string | null) => {
    buildTypeRef.current = typeId;
    setBuildType(typeId);
    showcaseRef.current?.selectBuildType(typeId);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    // Everything the render loop writes to the DOM directly goes through the
    // overlay; React is left with the state that actually changes rarely.
    const overlay = createHudOverlay({ ...hudNodes, onFpsChange: setFps });

    const options = {
      canvas,
      // The scene is mutable, so the panel is re-rendered when something is
      // placed. This runs on an edit, not on a frame.
      onSceneChange: setStats,
      // Escape leaves build mode from the canvas; the palette follows. Arming
      // the pointer again with what it just put down costs nothing.
      onBuildSelectionChange: selectBuildType,
      // A new resort brings its own labels; the old ones name objects that are
      // no longer standing.
      onAnchorsChange: setAnchors,
      onFrame: overlay.update,
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
        mounted.selectBuildType(buildTypeRef.current);
        setStats(mounted.stats);
        setAnchors(mounted.anchors);
        adoptParams(mounted.params);
      } catch (cause: unknown) {
        console.error(cause);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });

    return () => {
      disposed = true;
      lifecycle = lifecycle.then(() => {
        showcaseRef.current?.dispose();
        showcaseRef.current = null;
      });
    };
    // All three are stable, so the renderer is mounted exactly once.
  }, [hudNodes, selectBuildType, adoptParams]);

  const handleTimeChange = useCallback((time: number) => {
    setCycling(false);
    showcaseRef.current?.setTime(time);
  }, []);

  const handleCyclingChange = useCallback((next: boolean) => {
    setCycling(next);
    showcaseRef.current?.setCycling(next);
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app-canvas" />
      <Hud
        fps={fps}
        stats={stats}
        anchors={anchors}
        labelElements={hudNodes.labels}
        activeLightsElement={hudNodes.activeLights}
        timeElement={hudNodes.time}
        cycling={cycling}
        onTimeChange={handleTimeChange}
        onCyclingChange={handleCyclingChange}
        buildType={buildType}
        onBuildTypeChange={selectBuildType}
        params={resort.params}
        onGenerate={resort.generate}
        onClear={resort.clear}
        building={resort.building}
        error={error}
      />
    </div>
  );
}
