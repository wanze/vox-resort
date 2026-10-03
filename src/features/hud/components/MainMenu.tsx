import { useState, type ReactNode } from 'react';
import { HudDropdown } from './HudDropdown';
import { HudOption } from './HudOption';
import { MenuPage } from './MenuPage';
import { PixelIcon } from './PixelIcon';
import { WEATHER_NAMES } from './controlNames';
import { WeatherOptions } from './WeatherControl';
import { MENU_PAGES, pageIcon, pageKey, pageTitle, WINDOW_KEYS } from './windowNames';
import { isOpen, isShown } from '../domain/windowLayout';
import { SoundOptions } from '../../sound/components/SoundControl';
import { saveOrAsk } from '../../saves/domain/saveSlots';
import type { ClockControls } from '../../../app/useClockControls';
import type { SaveControls } from '../../../app/useSaves';
import type { SoundControls } from '../../../app/useSound';
import type { WindowControls } from '../../../app/useWindows';

export const SAVE_SHORTCUT = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')
  ? '⌘S'
  : 'Ctrl+S';

export interface ViewToggles {
  readonly markers: boolean;
  readonly onMarkersChange: (shown: boolean) => void;
  readonly signs: boolean;
  readonly onSignsChange: (shown: boolean) => void;
  readonly staffPins: boolean;
  readonly onStaffPinsChange: (shown: boolean) => void;
}

export interface MainMenuProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly windows: WindowControls;
  readonly saves: SaveControls;
  // Null only before the scene is up, when the game's own name stands in.
  readonly resortName: string | null;
  readonly onFind: () => void;
  readonly clock: ClockControls;
  readonly sound: SoundControls;
  readonly view: ViewToggles;
}

type SubPage = 'game' | 'windows' | 'view' | 'weather' | 'sound';

interface PageContext extends MainMenuProps {
  readonly title: string;
  readonly run: (action: () => void) => () => void;
}

const PAGE_TITLES: { readonly [page in SubPage]: string } = {
  game: 'Game',
  windows: 'Windows',
  view: 'View',
  weather: 'Weather',
  sound: 'Sound',
};

const weatherNote = ({ weather, forcedWeather }: ClockControls): string =>
  `${WEATHER_NAMES[weather]}, ${forcedWeather ? 'pinned' : 'forecast'}`;

const SOUND_ROWS = {
  on: { icon: 'sound', note: 'on' },
  off: { icon: 'muted', note: 'muted' },
} as const;

function RootPage(props: PageContext & { readonly onOpen: (page: SubPage) => void }) {
  const { saves, windows, clock, sound, run, onOpen } = props;
  const soundRow = SOUND_ROWS[sound.prefs.on ? 'on' : 'off'];
  return (
    <>
      <HudOption
        label="Save game"
        note={saves.current?.name ?? 'name it first'}
        shortcut={SAVE_SHORTCUT}
        disabled={!saves.available}
        onSelect={run(() => void saveOrAsk(saves.save, () => windows.show('saves', true)))}
      />
      <hr className="hud-rule" />
      <HudOption
        icon="resort"
        label="Game"
        note="start, load or rename"
        more
        onSelect={() => onOpen('game')}
      />
      <HudOption
        label="Windows"
        note="open and close every window"
        more
        onSelect={() => onOpen('windows')}
      />
      <HudOption
        icon="overlay"
        label="View"
        note="markers, signs and staff pins"
        more
        onSelect={() => onOpen('view')}
      />
      <HudOption
        icon={clock.weather}
        label="Weather"
        note={weatherNote(clock)}
        more
        onSelect={() => onOpen('weather')}
      />
      <HudOption
        icon={soundRow.icon}
        label="Sound"
        note={soundRow.note}
        more
        onSelect={() => onOpen('sound')}
      />
      <hr className="hud-rule" />
      <HudOption
        label="Find an action…"
        note="search every switch, window and thing to build"
        shortcut="/"
        onSelect={props.onFind}
      />
    </>
  );
}

const PAGES: { readonly [page in SubPage]: (props: PageContext) => ReactNode } = {
  game: ({ windows, run, title }) => (
    <>
      <HudOption
        icon="resort"
        label="New game…"
        note="tycoon or free play, on bare land or a generated resort"
        onSelect={run(() => windows.show('resort', true))}
      />
      <HudOption
        label="Load game…"
        note="pick up a saved game, or delete one"
        onSelect={run(() => windows.show('saves', true))}
      />
      <HudOption
        icon="rename"
        label="Rename resort…"
        note={title}
        onSelect={run(() => windows.show('name', true))}
      />
    </>
  ),
  windows: ({ windows, run }) => (
    <>
      {MENU_PAGES.map((page) => (
        <HudOption
          key={page}
          icon={pageIcon(page)}
          label={pageTitle(page)}
          shortcut={pageKey(page)}
          many
          checked={isShown(windows.layout, page)}
          onSelect={() => windows.toggle(page)}
        />
      ))}
      <hr className="hud-rule" />
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
    </>
  ),
  // Not layers: these stand over whichever layer the map view has on, or none.
  view: ({ view }) => (
    <>
      <HudOption
        label="Problem markers"
        note="pin a sign over every building in trouble"
        checked={view.markers}
        many
        onSelect={() => view.onMarkersChange(!view.markers)}
      />
      <HudOption
        label="Building signs"
        note="say what each building is, when zoomed in (N; hold Alt for names)"
        checked={view.signs}
        many
        onSelect={() => view.onSignsChange(!view.signs)}
      />
      <HudOption
        label="Staff pins"
        note="pin every member of staff on duty (S)"
        checked={view.staffPins}
        many
        onSelect={() => view.onStaffPinsChange(!view.staffPins)}
      />
    </>
  ),
  weather: ({ clock, onOpenChange }) => (
    <WeatherOptions
      forced={clock.forcedWeather}
      onWeatherChange={(weather) => {
        clock.setWeather(weather);
        onOpenChange(false);
      }}
    />
  ),
  sound: ({ sound }) => <SoundOptions prefs={sound.prefs} onChange={sound.setPrefs} />,
};

// Mounted only while the menu is open, so it always opens on the root page.
function MenuPages(props: PageContext) {
  const [page, setPage] = useState<SubPage | null>(null);
  if (page === null) return <RootPage {...props} onOpen={setPage} />;
  return (
    <MenuPage title={PAGE_TITLES[page]} onBack={() => setPage(null)}>
      {PAGES[page](props)}
    </MenuPage>
  );
}

export function MainMenu(props: MainMenuProps) {
  const { open, onOpenChange } = props;
  const title = props.resortName ?? 'Vox Resort';
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
          <span className="hud-wordmark">{title}</span>
        </>
      }
    >
      <MenuPages {...props} title={title} run={run} />
    </HudDropdown>
  );
}
