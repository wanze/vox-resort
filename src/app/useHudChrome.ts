import { useState } from 'react';
import { useHotkeys } from './useHotkeys';
import { useWindows, type WindowControls } from './useWindows';
import type { ClockControls } from './useClockControls';
import type { Hotkey } from '../features/hud/adapters/hotkeys';
import type { MenuId } from '../features/hud/components/TopBar';
import { escapeOutcome } from '../features/hud/domain/escape';
import type { BuildTool } from '../features/build/domain/buildTool';
import type { SelectionView } from '../features/inspect/domain/selection';

export interface HudChrome {
  readonly windows: WindowControls;
  readonly menu: MenuId | null;
  readonly setMenu: (menu: MenuId | null) => void;
}

const always = (action: () => void) => (): boolean => {
  action();
  return true;
};

export function useHudChrome(
  clock: ClockControls,
  tool: BuildTool | null,
  selection: SelectionView | null,
): HudChrome {
  const windows = useWindows();
  const [menu, setMenu] = useState<MenuId | null>(null);
  // An armed tool or an open inspector takes Escape first, so it only reaches the menu when idle.
  const idle = tool === null && selection === null;

  const hotkeys: readonly Hotkey[] = [
    { key: ' ', run: always(clock.togglePause) },
    { key: 'b', run: always(() => windows.toggle('build')) },
    { key: 'f3', run: always(() => windows.toggle('debug')) },
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
  useHotkeys(hotkeys);

  return { windows, menu, setMenu };
}
