import { PixelIcon } from '../../../shared/components/PixelIcon';
import { DOCK_WINDOWS, WINDOW_ICONS, WINDOW_KEYS, WINDOW_TITLES } from './windowNames';
import { isOpen, type WindowId, type WindowLayout } from '../domain/windowLayout';

export interface WindowDockProps {
  readonly layout: WindowLayout;
  readonly onToggle: (id: WindowId) => void;
  readonly adviceCount: number;
}

const hintOf = (id: WindowId): string => {
  const key = WINDOW_KEYS[id];
  return key ? `${WINDOW_TITLES[id]} (${key})` : WINDOW_TITLES[id];
};

export function WindowDock({ layout, onToggle, adviceCount }: WindowDockProps) {
  return (
    <nav className="ui-plate hud-dock" aria-label="Windows">
      {DOCK_WINDOWS.map((id) => {
        const badged = id === 'inbox' && adviceCount > 0;
        // Named on the button: on the rail its visible label is hidden, and the count alone is no name.
        return (
          <button
            key={id}
            type="button"
            className="ui-tab hud-tool"
            data-dock={id}
            aria-pressed={isOpen(layout, id)}
            title={hintOf(id)}
            aria-label={badged ? `${WINDOW_TITLES[id]}, ${adviceCount} to look at` : undefined}
            onClick={() => onToggle(id)}
          >
            <PixelIcon name={WINDOW_ICONS[id]} />
            <span className="hud-tool-label">{WINDOW_TITLES[id]}</span>
            {badged ? (
              <span className="ui-badge" aria-hidden="true">
                {adviceCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
