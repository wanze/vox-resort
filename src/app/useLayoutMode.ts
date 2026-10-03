import { useEffect, useState } from 'react';
import { watchViewport } from '../features/hud/adapters/viewportSize';
import { layoutModeFor, type LayoutMode } from '../features/hud/domain/layoutMode';

const current = (): LayoutMode => layoutModeFor(globalThis.innerWidth, globalThis.innerHeight);

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(current);
  // React skips the render when the mode it is handed is the one it holds.
  useEffect(() => watchViewport((width, height) => setMode(layoutModeFor(width, height))), []);
  return mode;
}
