import { HudDropdown } from './HudDropdown';
import { HudOption } from './HudOption';
import { PixelIcon } from './PixelIcon';
import { TOOLBAR_WINDOWS, WINDOW_ICONS, WINDOW_KEYS, WINDOW_TITLES } from './windowNames';
import { isOpen } from '../domain/windowLayout';
import type { WindowControls } from '../../../app/useWindows';

export interface MainMenuProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly windows: WindowControls;
}

export function MainMenu({ open, onOpenChange, windows }: MainMenuProps) {
  const run = (action: () => void) => (): void => {
    action();
    onOpenChange(false);
  };

  return (
    <HudDropdown
      className="hud-menu"
      open={open}
      onOpenChange={onOpenChange}
      title="Menu (Esc)"
      label={
        <>
          <PixelIcon name="menu" />
          <span className="hud-wordmark">Vox Resort</span>
        </>
      }
    >
      <p className="hud-menu-heading">Game</p>
      <HudOption
        icon="resort"
        label="New resort…"
        note="grow one, or start from bare ground"
        onSelect={run(() => windows.show('resort', true))}
      />
      <HudOption label="Save game" note="coming soon" disabled onSelect={() => {}} />
      <HudOption label="Load game" note="coming soon" disabled onSelect={() => {}} />

      <p className="hud-menu-heading">Windows</p>
      {TOOLBAR_WINDOWS.map((id) => (
        <HudOption
          key={id}
          icon={WINDOW_ICONS[id]}
          label={WINDOW_TITLES[id]}
          shortcut={WINDOW_KEYS[id]}
          many
          checked={isOpen(windows.layout, id)}
          onSelect={() => windows.toggle(id)}
        />
      ))}

      <p className="hud-menu-heading">Options</p>
      <HudOption
        icon="debug"
        label="Debug info"
        note="frame rate, frame cost and what is drawn"
        shortcut={WINDOW_KEYS.debug}
        many
        checked={isOpen(windows.layout, 'debug')}
        onSelect={() => windows.toggle('debug')}
      />
      <HudOption
        label="Reset window positions"
        note="put every window back where it started"
        onSelect={run(windows.resetPlaces)}
      />
    </HudDropdown>
  );
}
