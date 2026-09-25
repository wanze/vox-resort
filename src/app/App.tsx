import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { previewUrl } from '../features/catalog/adapters/previews';
import { createHudOverlay } from '../features/hud/adapters/hudOverlay';
import { Hud } from '../features/hud/components/Hud';
import { useHudNodes } from './useHudNodes';
import { useCameraControls } from './useCameraControls';
import { useClockControls } from './useClockControls';
import { useAdvice } from './useAdvice';
import { useThoughts } from './useThoughts';
import { useInspector } from './useInspector';
import { useResortControls } from './useResortControls';
import { mountShowcase, type Showcase, type ShowcaseStats } from './showcase';
import type { BuildTool } from '../features/build/domain/buildTool';

// Serialised so StrictMode's double-invoked effect never puts two renderers on the same canvas.
let lifecycle: Promise<void> = Promise.resolve();

function useBuildTool(showcase: RefObject<Showcase | null>) {
  // So a tool picked while the catalogue is still meshing is armed once the scene exists.
  const pending = useRef<BuildTool | null>(null);
  const [tool, setTool] = useState<BuildTool | null>(null);
  const select = useCallback(
    (next: BuildTool | null) => {
      pending.current = next;
      setTool(next);
      showcase.current?.selectTool(next);
    },
    [showcase],
  );
  return { tool, select, pending };
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudNodes = useHudNodes();
  const showcaseRef = useRef<Showcase | null>(null);
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { tool, select: selectTool, pending: toolRef } = useBuildTool(showcaseRef);
  const resort = useResortControls(showcaseRef);
  const camera = useCameraControls(showcaseRef);
  const clock = useClockControls(showcaseRef);
  const inspector = useInspector(showcaseRef);
  const advice = useAdvice(showcaseRef);
  const thoughts = useThoughts();
  // The setters are stable but the objects holding them are not; depending on those would tear the
  // renderer down on every render.
  const { adopt: adoptParams, adoptOpen } = resort;
  const { adopt: adoptCamera } = camera;
  const { adopt: adoptSelection } = inspector;
  const { adopt: adoptAdvice } = advice;
  const { adopt: adoptVoices } = thoughts;
  const { adoptWeather } = clock;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    // The render loop writes to the DOM through the overlay; React only holds state that changes rarely.
    const overlay = createHudOverlay({ ...hudNodes, onFpsChange: setFps });

    const options = {
      canvas,
      onSceneChange: setStats,
      onToolChange: selectTool,
      onCameraChange: adoptCamera,
      onSelectionChange: adoptSelection,
      onAdviceChange: adoptAdvice,
      onThoughtsChange: adoptVoices,
      onWeatherChange: adoptWeather,
      onOpenChange: adoptOpen,
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
        // So the panel says something before the first check-in hour comes round.
        adoptAdvice(mounted.advice);
        adoptVoices(mounted.voices);
        adoptCamera(mounted.cameraView);
        adoptParams(mounted.params);
        adoptOpen(mounted.open);
        // So the bar says what kind of day it is before midnight comes round.
        adoptWeather(mounted.stats.weather);
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
  }, [
    hudNodes,
    selectTool,
    toolRef,
    adoptParams,
    adoptOpen,
    adoptCamera,
    adoptSelection,
    adoptAdvice,
    adoptVoices,
    adoptWeather,
  ]);

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
        advice={advice.advice}
        voices={thoughts.voices}
        onShowOnPlot={advice.showOnPlot}
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
