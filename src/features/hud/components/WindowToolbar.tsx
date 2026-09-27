import { PixelIcon } from './PixelIcon';
import { TOOLBAR_WINDOWS, WINDOW_ICONS, WINDOW_KEYS, WINDOW_TITLES } from './windowNames';
import { isOpen, type WindowId, type WindowLayout } from '../domain/windowLayout';

export interface WindowToolbarProps {
  readonly layout: WindowLayout;
  readonly onToggle: (id: WindowId) => void;
  readonly adviceCount: number;
}

const hintOf = (id: WindowId): string => {
  const key = WINDOW_KEYS[id];
  return key ? `${WINDOW_TITLES[id]} (${key})` : WINDOW_TITLES[id];
};

export function WindowToolbar({ layout, onToggle, adviceCount }: WindowToolbarProps) {
  return (
    <nav className="hud-plate hud-toolbar" aria-label="Windows">
      {TOOLBAR_WINDOWS.map((id) => (
        <button
          key={id}
          type="button"
          className="hud-tool"
          aria-pressed={isOpen(layout, id)}
          title={hintOf(id)}
          onClick={() => onToggle(id)}
        >
          <PixelIcon name={WINDOW_ICONS[id]} />
          <span className="hud-tool-label">{WINDOW_TITLES[id]}</span>
          {id === 'advice' && adviceCount > 0 ? (
            <span className="hud-tool-badge" aria-label={`${adviceCount} to look at`}>
              {adviceCount}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
