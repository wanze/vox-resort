import { useState, type ReactNode } from 'react';
import { DropdownMenu } from '../../../shared/components/Dropdown';
import { MenuOption } from '../../../shared/components/MenuOption';
import { MenuPage } from './MenuPage';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { WEATHER_NAMES } from './controlNames';
import { WeatherOptions } from './WeatherControl';
import { MENU_PAGES, pageIcon, pageKey, pageTitle, WINDOW_KEYS } from './windowNames';
import { isOpen, isShown } from '../domain/windowLayout';
import { keyLabel } from '../domain/keymap';
import { SoundOptions } from '../../sound/components/SoundControl';
import { saveOrAsk } from '../../saves/domain/saveSlots';
import { HighlightOptions } from '../../highlights/components/HighlightControl';
import { OverlayOptions } from '../../overlays/components/OverlayControl';
import { OVERLAY_NAMES } from '../../overlays/components/overlayNames';
import type { HighlightControls } from '../../highlights/components/highlightControls';
import type { ClockControls, SoundControls, WindowControls } from './hudControls';
import type { OverlayControls } from '../../overlays/components/overlayControls';
import type { SaveControls } from '../../saves/components/saveControls';

const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
export const SAVE_SHORTCUT = keyLabel('save', MAC);

export interface ViewToggles {
  readonly markers: boolean;
  readonly onMarkersChange: (shown: boolean) => void;
  readonly signs: boolean;
  readonly onSignsChange: (shown: boolean) => void;
  readonly staffPins: boolean;
  readonly onStaffPinsChange: (shown: boolean) => void;
}

export interface ShortcutToggle {
  readonly singleKeys: boolean;
  readonly onSingleKeysChange: (on: boolean) => void;
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
  readonly shortcuts: ShortcutToggle;
  readonly highlights: HighlightControls;
  readonly overlay: OverlayControls;
  readonly gates: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void };
  readonly onPhoto: () => void;
}

type SubPage = 'game' | 'windows' | 'view' | 'highlight' | 'maps' | 'weather' | 'settings';

interface PageContext extends MainMenuProps {
  readonly title: string;
  readonly run: (action: () => void) => () => void;
}

const PAGE_TITLES: { readonly [page in SubPage]: string } = {
  game: 'Game',
  windows: 'Windows',
  view: 'View',
  highlight: 'Highlight buildings',
  maps: 'Map view',
  weather: 'Weather',
  settings: 'Settings',
};

const weatherNote = ({ weather, forcedWeather }: ClockControls): string =>
  `${WEATHER_NAMES[weather]}, ${forcedWeather ? 'pinned' : 'forecast'}`;

const settingsNote = (sound: SoundControls, shortcuts: ShortcutToggle): string =>
  `${sound.prefs.on ? 'sound on' : 'sound muted'}, ${shortcuts.singleKeys ? 'all shortcuts' : 'no single-key shortcuts'}`;

// The heading is for the eye; the group carries the same name for a screen reader.
function MenuGroup({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="hud-menu-group" role="group" aria-label={label}>
      <p className="ui-label hud-menu-heading" aria-hidden="true">
        {label}
      </p>
      {children}
    </div>
  );
}

interface PageProps extends PageContext {
  readonly onOpen: (page: SubPage) => void;
}

// Back from a page goes to the page that opened it, not always to the root.
const PAGE_PARENTS: { readonly [page in SubPage]?: SubPage } = { highlight: 'view', maps: 'view' };

// What a narrow strip has given up, each row shown by the stylesheet once the strip folds its chip
// away; the map views fold later than the highlight picker.
function NarrowViewRows({
  highlights,
  overlay,
  onOpen,
}: Pick<PageProps, 'highlights' | 'overlay' | 'onOpen'>) {
  const picked = highlights.picks.length;
  return (
    <>
      <div className="hud-menu-highlight">
        <hr className="ui-rule" />
        <MenuOption
          icon="inspect"
          label="Highlight buildings"
          note={picked > 0 ? `${picked} kinds ringed` : 'ring every building of a kind'}
          more
          onSelect={() => onOpen('highlight')}
        />
      </div>
      <div className="hud-menu-maps">
        <MenuOption
          icon="overlay"
          label="Map view"
          note={overlay.kind ? OVERLAY_NAMES[overlay.kind] : 'off'}
          more
          onSelect={() => onOpen('maps')}
        />
      </div>
    </>
  );
}

// Shown by the stylesheet only where the bar has given up its own gates switch.
function GatesOption({ gates, run }: Pick<PageContext, 'gates' | 'run'>) {
  return (
    <div className="hud-menu-gates">
      <MenuOption
        icon="guests"
        label={gates.open ? 'Close the gates' : 'Open the gates'}
        note={gates.open ? 'turn new guests away' : 'let new guests in'}
        onSelect={run(() => gates.onOpenChange(!gates.open))}
      />
    </div>
  );
}

function RootPage(props: PageProps) {
  const { saves, windows, clock, sound, shortcuts, run, onOpen } = props;
  return (
    <>
      <MenuOption
        icon="saves"
        label="Save game"
        note={saves.current?.name ?? 'name it first'}
        shortcut={SAVE_SHORTCUT}
        disabled={!saves.available}
        onSelect={run(() => void saveOrAsk(saves.save, () => windows.show('saves', true)))}
      />
      <GatesOption gates={props.gates} run={run} />
      <MenuOption
        icon="camera"
        label="Photo mode"
        note="hide the HUD and take a picture"
        shortcut={keyLabel('photo')}
        onSelect={run(props.onPhoto)}
      />
      <hr className="ui-rule" />
      <MenuOption
        icon="resort"
        label="Game"
        note="start, load, rename or share"
        more
        onSelect={() => onOpen('game')}
      />
      <MenuOption
        icon="windows"
        label="Windows"
        note="open and close every window"
        more
        onSelect={() => onOpen('windows')}
      />
      <MenuOption
        icon="overlay"
        label="View"
        note="markers, signs and staff pins"
        more
        onSelect={() => onOpen('view')}
      />
      <MenuOption
        icon={clock.weather}
        label="Weather"
        note={weatherNote(clock)}
        more
        onSelect={() => onOpen('weather')}
      />
      <MenuOption
        icon="settings"
        label="Settings"
        note={settingsNote(sound, shortcuts)}
        more
        onSelect={() => onOpen('settings')}
      />
      <hr className="ui-rule" />
      <MenuOption
        label="Find an action…"
        note="search every switch, window and thing to build"
        shortcut={keyLabel('find')}
        onSelect={props.onFind}
      />
    </>
  );
}

const PAGES: { readonly [page in SubPage]: (props: PageProps) => ReactNode } = {
  game: ({ windows, run, title }) => (
    <>
      <MenuOption
        icon="resort"
        label="New game…"
        note="tycoon or free play, on bare land or a generated resort"
        onSelect={run(() => windows.show('resort', true))}
      />
      <MenuOption
        label="Load game…"
        note="pick up a saved game, or delete one"
        onSelect={run(() => windows.show('saves', true))}
      />
      <MenuOption
        icon="rename"
        label="Rename resort…"
        note={title}
        onSelect={run(() => windows.show('name', true))}
      />
      <MenuOption
        icon="share"
        label="Share resort…"
        note="a link to its layout"
        onSelect={run(() => windows.show('share', true))}
      />
    </>
  ),
  windows: ({ windows, run }) => (
    <>
      {MENU_PAGES.map((page) => (
        <MenuOption
          key={page}
          icon={pageIcon(page)}
          label={pageTitle(page)}
          shortcut={pageKey(page)}
          many
          checked={isShown(windows.layout, page)}
          onSelect={() => windows.toggle(page)}
        />
      ))}
      <hr className="ui-rule" />
      <MenuOption
        icon="debug"
        label="Debug info"
        note="frame rate, frame cost and what is drawn"
        shortcut={WINDOW_KEYS.debug}
        many
        checked={isOpen(windows.layout, 'debug')}
        onSelect={() => windows.toggle('debug')}
      />
      <MenuOption
        label="Reset window positions"
        note="put every window back where it started"
        onSelect={run(windows.resetPlaces)}
      />
    </>
  ),
  // Not layers: these stand over whichever layer the map view has on, or none.
  view: ({ view, highlights, overlay, onOpen }) => (
    <>
      <MenuOption
        label="Problem markers"
        note="pin a sign over every building in trouble"
        checked={view.markers}
        many
        onSelect={() => view.onMarkersChange(!view.markers)}
      />
      <MenuOption
        label="Building signs"
        note={`say what each building is, when zoomed in (${keyLabel('signs')}; hold Alt for names)`}
        checked={view.signs}
        many
        onSelect={() => view.onSignsChange(!view.signs)}
      />
      <MenuOption
        label="Staff pins"
        note={`pin every member of staff on duty (${keyLabel('staffPins')})`}
        checked={view.staffPins}
        many
        onSelect={() => view.onStaffPinsChange(!view.staffPins)}
      />
      <NarrowViewRows highlights={highlights} overlay={overlay} onOpen={onOpen} />
    </>
  ),
  maps: ({ overlay, onOpenChange }) => (
    <OverlayOptions
      kind={overlay.kind}
      onKindChange={overlay.setOverlay}
      onDone={() => onOpenChange(false)}
    />
  ),
  highlight: ({ highlights, onOpenChange }) => (
    <HighlightOptions
      highlights={highlights}
      focusSearch={false}
      onDone={() => onOpenChange(false)}
    />
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
  settings: ({ sound, shortcuts }) => (
    <>
      <MenuGroup label="Sound">
        <SoundOptions prefs={sound.prefs} onChange={sound.setPrefs} />
      </MenuGroup>
      <MenuGroup label="Keyboard">
        <MenuOption
          label="Single-key shortcuts"
          note={`keys such as ${keyLabel('build')} and ${keyLabel('pause')}; ${keyLabel('cancel')} and ${keyLabel('palette', MAC)} always work`}
          checked={shortcuts.singleKeys}
          many
          onSelect={() => shortcuts.onSingleKeysChange(!shortcuts.singleKeys)}
        />
      </MenuGroup>
    </>
  ),
};

// Mounted only while the menu is open, so it always opens on the root page.
function MenuPages(props: PageContext) {
  const [page, setPage] = useState<SubPage | null>(null);
  if (page === null) return <RootPage {...props} onOpen={setPage} />;
  return (
    <MenuPage title={PAGE_TITLES[page]} onBack={() => setPage(PAGE_PARENTS[page] ?? null)}>
      {PAGES[page]({ ...props, onOpen: setPage })}
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
    <DropdownMenu
      className="hud-menu"
      open={open}
      onOpenChange={onOpenChange}
      title={`Menu (${keyLabel('cancel')})`}
      label={
        <>
          <PixelIcon name="menu" />
          <span className="hud-wordmark">{title}</span>
        </>
      }
    >
      <MenuPages {...props} title={title} run={run} />
    </DropdownMenu>
  );
}
