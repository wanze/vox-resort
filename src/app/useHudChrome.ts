import { useCallback, useState } from 'react';
import { useHotkeys } from './useHotkeys';
import { useWindows, type WindowControls } from './useWindows';
import type { ClockControls } from './useClockControls';
import type { SaveControls } from './useSaves';
import { saveOrAsk } from '../features/saves/domain/saveSlots';
import type { Hotkey } from '../features/hud/adapters/hotkeys';
import type { MenuId } from '../features/hud/components/TopBar';
import { escapeOutcome } from '../features/hud/domain/escape';
import type { BuildTool } from '../features/build/domain/buildTool';
import { cycledTool } from '../features/build/domain/stylePick';
import type { SelectionView } from '../features/inspect/domain/selection';

export interface HudChrome {
  readonly windows: WindowControls;
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
): HudChrome {
  const windows = useWindows();
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [palette, showPalette] = useState(false);
  // One thing on top at a time, so the palette never opens under a dropdown still listening for Escape.
  const setPalette = useCallback((open: boolean) => {
    if (open) setMenu(null);
    showPalette(open);
  }, []);
  // An armed tool or an open inspector takes Escape first, so it only reaches the menu when idle.
  const idle = tool === null && selection === null;

  const hotkeys: readonly Hotkey[] = [
    { key: 'k', chord: true, run: always(() => setPalette(!palette)) },
    // Taken whatever the game's state, so the browser's own save-page dialog never opens.
    {
      key: 's',
      chord: true,
      run: always(() => void saveOrAsk(saves.save, () => windows.show('saves', true))),
    },
    { key: '/', run: always(() => setPalette(true)) },
    { key: ' ', run: always(clock.togglePause) },
    { key: 'b', run: always(() => windows.toggle('build')) },
    { key: 's', run: always(toggles.staffPins) },
    {
      key: 'l',
      run: () => {
        toggles.land?.();
        return toggles.land !== null;
      },
    },
    { key: 'f3', run: always(() => windows.toggle('debug')) },
    // Passed on unless the armed family has styles to cycle through.
    {
      key: 'v',
      run: () => {
        const next = cycledTool(tool);
        if (next) onToolChange(next);
        return next !== null;
      },
    },
    {
      key: 'escape',
      run: () => {
        const outcome = escapeOutcome(menu !== null, idle);
        if (outcome === 'pass') return false;
        setMenu(outcome === 'open' ? 'main' : null);
        return true;
      },
    },
  ];
  // None behind the welcome screen: there is no HUD for them to open.
  useHotkeys(playing ? hotkeys : []);

  return { windows, menu, setMenu, palette, setPalette };
}
