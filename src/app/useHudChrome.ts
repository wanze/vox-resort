import { useCallback, useState } from 'react';
import { useHotkeys } from './useHotkeys';
import { useWindows } from './useWindows';
import { saveOrAsk } from '../features/saves/domain/saveSlots';
import type { MenuId } from '../features/hud/components/TopBar';
import { escapeOutcome } from '../features/hud/domain/escape';
import { hotkeysFor, type HudAction } from '../features/hud/domain/keymap';
import type { BuildTool } from '../features/build/domain/buildTool';
import { cycledTool } from '../features/build/domain/stylePick';
import type { SelectionView } from '../features/inspect/domain/selection';
import type { LayoutMode } from '../features/hud/domain/layoutMode';
import { useLayoutMode } from './useLayoutMode';
import type { ClockControls, WindowControls } from '../features/hud/components/hudControls';
import type { SaveControls } from '../features/saves/components/saveControls';

export interface HudChrome {
  readonly windows: WindowControls;
  readonly layout: LayoutMode;
  readonly menu: MenuId | null;
  readonly setMenu: (menu: MenuId | null) => void;
  readonly palette: boolean;
  readonly setPalette: (open: boolean) => void;
}

const always = (action: () => void) => (): boolean => {
  action();
  return true;
};

// Null for a key with nothing to do, which then passes on to whatever else listens for it.
export interface HudToggles {
  readonly staffPins: () => void;
  readonly signs: () => void;
  readonly sound: () => void;
  readonly land: (() => void) | null;
}

export function useHudChrome(
  clock: ClockControls,
  tool: BuildTool | null,
  onToolChange: (tool: BuildTool | null) => void,
  selection: SelectionView | null,
  playing: boolean,
  saves: SaveControls,
  toggles: HudToggles,
  singleKeys: boolean,
): HudChrome {
  const layout = useLayoutMode();
  const windows = useWindows(layout);
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [palette, showPalette] = useState(false);
  // One thing on top at a time, so the palette never opens under a dropdown still listening for Escape.
  const setPalette = useCallback((open: boolean) => {
    if (open) setMenu(null);
    showPalette(open);
  }, []);
  // An armed tool or an open inspector takes Escape first, so it only reaches the menu when idle.
  const idle = tool === null && selection === null;

  const runs: { readonly [action in HudAction]: () => boolean } = {
    palette: always(() => setPalette(!palette)),
    // Taken whatever the game's state, so the browser's own save-page dialog never opens.
    save: always(() => void saveOrAsk(saves.save, () => windows.show('saves', true))),
    find: always(() => setPalette(true)),
    pause: always(clock.togglePause),
    build: always(() => windows.toggle('build')),
    staffPins: always(toggles.staffPins),
    signs: always(toggles.signs),
    sound: always(toggles.sound),
    land: () => {
      toggles.land?.();
      return toggles.land !== null;
    },
    debug: always(() => windows.toggle('debug')),
    // Passed on unless the armed family has styles to cycle through.
    nextStyle: () => {
      const next = cycledTool(tool);
      if (next) onToolChange(next);
      return next !== null;
    },
    cancel: () => {
      const outcome = escapeOutcome(menu !== null, idle);
      if (outcome === 'pass') return false;
      setMenu(outcome === 'open' ? 'main' : null);
      return true;
    },
  };
  // None behind the welcome screen: there is no HUD for them to open.
  useHotkeys(playing ? hotkeysFor(runs, singleKeys) : []);

  return { windows, layout, menu, setMenu, palette, setPalette };
}
