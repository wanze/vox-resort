import { useCallback, useEffect, useRef, useState } from "react";
import { sortByDepth } from "../features/hud/domain/labelProjection";
import { Hud } from "../features/hud/components/Hud";
import {
  mountShowcase,
  type FrameUpdate,
  type LabelAnchor,
  type Showcase,
  type ShowcaseStats,
} from "./showcase";

/**
 * Mount and dispose are serialised through this chain so React 19's StrictMode
 * double-invoked effect can never put two renderers on the same canvas.
 */
let lifecycle: Promise<void> = Promise.resolve();

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelElements = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeLightsElement = useRef<HTMLSpanElement | null>(null);
  const timeElement = useRef<HTMLInputElement | null>(null);
  const showcaseRef = useRef<Showcase | null>(null);
  const fpsRef = useRef(0);
  const activeLightsRef = useRef(-1);

  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [anchors, setAnchors] = useState<readonly LabelAnchor[]>([]);
  const [cycling, setCycling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    const options = {
      canvas,
      onFrame: ({ fps: nextFps, time, activeLights, labels }: FrameUpdate) => {
        // Positioning happens straight on the DOM nodes: re-rendering the HUD
        // every frame would distort the very frame rate being measured.
        for (const [id, element] of labelElements.current) {
          if (!labels.has(id)) element.style.visibility = "hidden";
        }
        const visible = sortByDepth([...labels].map(([id, screen]) => ({ id, screen })));
        visible.forEach(({ id, screen }, index) => {
          const element = labelElements.current.get(id);
          if (!element) return;
          element.style.visibility = "visible";
          // Far to near, so a nearby label always covers one behind it.
          element.style.zIndex = String(index);
          element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
        });
        if (nextFps !== fpsRef.current) {
          fpsRef.current = nextFps;
          setFps(nextFps);
        }
        if (activeLights !== activeLightsRef.current && activeLightsElement.current) {
          activeLightsRef.current = activeLights;
          activeLightsElement.current.textContent = String(activeLights);
        }
        // The slider follows the clock while the cycle runs, without React.
        if (timeElement.current && document.activeElement !== timeElement.current) {
          timeElement.current.value = time.toFixed(3);
        }
      },
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
        setStats(mounted.stats);
        setAnchors(mounted.anchors);
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
  }, []);

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
        labelElements={labelElements}
        activeLightsElement={activeLightsElement}
        timeElement={timeElement}
        cycling={cycling}
        onTimeChange={handleTimeChange}
        onCyclingChange={handleCyclingChange}
        error={error}
      />
    </div>
  );
}
