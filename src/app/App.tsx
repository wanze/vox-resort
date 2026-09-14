import { useCallback, useEffect, useRef, useState } from 'react';
import { previewUrl } from '../features/catalog/adapters/previews';
import { createHudOverlay } from '../features/hud/adapters/hudOverlay';
import { Hud } from '../features/hud/components/Hud';
import { useHudNodes } from './useHudNodes';
import { useCameraControls } from './useCameraControls';
import { useClockControls } from './useClockControls';
import { useInspector } from './useInspector';
import { useResortControls } from './useResortControls';
import { mountShowcase, type Showcase, type ShowcaseStats } from './showcase';
import type { BuildTool } from '../features/build/domain/buildTool';

/**
 * Mount and dispose are serialised through this chain so React 19's StrictMode
 * double-invoked effect can never put two renderers on the same canvas.
 */
let lifecycle: Promise<void> = Promise.resolve();

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudNodes = useHudNodes();
  const showcaseRef = useRef<Showcase | null>(null);
  /** Mirrors the palette selection, so a tool picked while the catalogue is
   * still being meshed is armed as soon as the scene exists. */
  const toolRef = useRef<BuildTool | null>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [tool, setTool] = useState<BuildTool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resort = useResortControls(showcaseRef);
  const camera = useCameraControls(showcaseRef);
  const clock = useClockControls(showcaseRef);
  const inspector = useInspector(showcaseRef);
  // Pulled out because the mount effect depends on them: the setters React hands
  // back are stable, the objects holding them are not, and depending on those
  // would tear the renderer down on every render.
  const { adopt: adoptParams } = resort;
  const { adopt: adoptCamera } = camera;
  const { adopt: adoptSelection } = inspector;

  /** Arms the pointer with a tool, and keeps the palette showing which. */
  const selectTool = useCallback((next: BuildTool | null) => {
    toolRef.current = next;
    setTool(next);
    showcaseRef.current?.selectTool(next);
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
      // Escape puts the pointer down from the canvas; the palette follows.
      // Arming it again with what it just put down costs nothing.
      onToolChange: selectTool,
      // C, Q and E move the camera from the canvas; the panel follows.
      onCameraChange: adoptCamera,
      // A click on the canvas; runs on a click, not on a frame.
      onSelectionChange: adoptSelection,
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
        mounted.selectTool(toolRef.current);
        setStats(mounted.stats);
        adoptCamera(mounted.cameraView);
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
    // All of them are stable, so the renderer is mounted exactly once.
  }, [hudNodes, selectTool, adoptParams, adoptCamera, adoptSelection]);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app-canvas" />
      <Hud
        fps={fps}
        stats={stats}
        activeLightsElement={hudNodes.activeLights}
        drawnElement={hudNodes.drawn}
        frameCostElements={{
          cpu: hudNodes.cpu,
          detail: hudNodes.detail,
          shaders: hudNodes.shaders,
        }}
        timeElement={hudNodes.time}
        clockElement={hudNodes.clock}
        clock={clock}
        camera={camera}
        resort={resort}
        preview={previewUrl}
        tool={tool}
        onToolChange={selectTool}
        selection={inspector.selection}
        inspectElement={hudNodes.inspect}
        onSelectPerson={inspector.selectPerson}
        onClearSelection={inspector.clear}
        error={error}
      />
    </div>
  );
}
