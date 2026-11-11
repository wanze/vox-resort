import { useState, type ReactNode } from 'react';
import { DropdownMenu } from '../../../shared/components/Dropdown';
import { MenuOption } from '../../../shared/components/MenuOption';
import { MenuPage } from './MenuPage';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { WEATHER_NAMES, WEATHER_NOTES } from './controlNames';
import { daysAhead, forecastLabel } from './WeatherForecast';
import {
  DEBUG_ACTIONS,
  MENU_PAGES,
  pageIcon,
  pageKey,
  pageTitle,
  WINDOW_KEYS,
} from './windowNames';
import { isOpen, isShown } from '../domain/windowLayout';
import { keyLabel } from '../domain/keymap';
import { SoundOptions } from '../../sound/components/SoundControl';
import { saveOrAsk } from '../../saves/domain/saveSlots';
import { HighlightOptions } from '../../highlights/components/HighlightPicker';
import { OverlayOptions } from '../../overlays/components/OverlayPicker';
import { OVERLAY_NAMES } from '../../overlays/components/overlayNames';
import type { HighlightControls } from '../../highlights/components/highlightControls';
import type { ClockControls, LookControls, SoundControls, WindowControls } from './hudControls';
import type { OverlayControls } from '../../overlays/components/overlayControls';
import type { SaveControls } from '../../saves/components/saveControls';
import type { DayForecast } from '../../events/domain/programmeView';
import type { PausePrefs } from '../domain/stops';
import { LOOKS } from '../domain/looks';
import { LOOK_NAMES, LOOK_NOTES } from './lookWords';

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

export interface PauseToggles {
  readonly prefs: PausePrefs;
  readonly onChange: (pause: keyof PausePrefs, on: boolean) => void;
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
  // From today, one a day.
  readonly forecast: readonly DayForecast[];
  readonly sound: SoundControls;
  readonly look: LookControls;
  readonly view: ViewToggles;
  readonly shortcuts: ShortcutToggle;
  readonly pauses: PauseToggles;
  readonly highlights: HighlightControls;
  readonly overlay: OverlayControls;
  readonly gates: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void };
  // Between seasons the gates open only with the next season.
  readonly season: { readonly next: number; readonly onOpen: () => void } | null;
  readonly onPhoto: () => void;
  // Offers the Debug window, which only a build with debug mode has.
  readonly debug: boolean;
}

type SubPage = 'game' | 'windows' | 'view' | 'highlight' | 'maps' | 'weather' | 'settings';

interface PageContext extends MainMenuProps {
  readonly run: (action: () => void) => () => void;
}

const PAGE_TITLES: { readonly [page in SubPage]: string } = {
  game: 'Game',
  windows: 'Windows',
  view: 'View',
  highlight: 'Highlight buildings',
  maps: 'Map view',
  weather: 'Weather forecast',
  settings: 'Settings',
};

const PAUSES: readonly (readonly [keyof PausePrefs, string, string])[] = [
  ['pauseWeek', 'For the week ahead', "each Monday, with the week's poster"],
  ['pauseOffers', 'For booking offers', 'each is open for a day, with the voucher to answer'],
];

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

// What a narrow strip has given up, shown by the stylesheet once the strip folds its View key away.
function NarrowViewRows({
  highlights,
  overlay,
  onOpen,
}: Pick<PageProps, 'highlights' | 'overlay' | 'onOpen'>) {
  const picked = highlights.picks.length;
  return (
    <div className="hud-menu-view-pickers">
      <hr className="ui-rule" />
      <MenuOption
        icon="overlay"
        label="Map view"
        value={overlay.kind ? OVERLAY_NAMES[overlay.kind] : undefined}
        more
        onSelect={() => onOpen('maps')}
      />
      <MenuOption
        icon="inspect"
        label="Highlight buildings"
        value={picked > 0 ? `${picked} ringed` : undefined}
        more
        onSelect={() => onOpen('highlight')}
      />
    </div>
  );
}

// Shown by the stylesheet only once the bar has folded its weather key away.
function WeatherRow({ clock, onOpen }: Pick<PageProps, 'clock' | 'onOpen'>) {
  return (
    <div className="hud-menu-weather">
      <MenuOption
        icon={clock.weather}
        label="Weather"
        value={WEATHER_NAMES[clock.weather]}
        more
        onSelect={() => onOpen('weather')}
      />
    </div>
  );
}

function LookOptions({ look, setLook }: LookControls) {
  return LOOKS.map((each) => (
    <MenuOption
      key={each}
      label={LOOK_NAMES[each]}
      note={LOOK_NOTES[each]}
      checked={look === each}
      onSelect={() => setLook(each)}
    />
  ));
}

// Shown by the stylesheet only where the bar has given up its own gates switch.
function GatesOption({ gates, season, run }: Pick<PageContext, 'gates' | 'season' | 'run'>) {
  return (
    <div className="hud-menu-gates">
      {season ? (
        <MenuOption
          icon="guests"
          label={`Open season ${season.next}`}
          onSelect={run(season.onOpen)}
        />
      ) : (
        <MenuOption
          icon="guests"
          label={gates.open ? 'Close the gates' : 'Open the gates'}
          onSelect={run(() => gates.onOpenChange(!gates.open))}
        />
      )}
    </div>
  );
}

function RootPage(props: PageProps) {
  const { saves, windows, clock, sound, run, onOpen } = props;
  return (
    <>
      <MenuOption
        icon="inspect"
        label="Find an action…"
        shortcut={keyLabel('find')}
        onSelect={props.onFind}
      />
      <hr className="ui-rule" />
      <MenuOption
        icon="saves"
        label="Save game"
        shortcut={SAVE_SHORTCUT}
        disabled={!saves.available}
        onSelect={run(() => void saveOrAsk(saves.save, () => windows.show('saves', true)))}
      />
      <GatesOption gates={props.gates} season={props.season} run={run} />
      <MenuOption
        icon="camera"
        label="Photo mode"
        shortcut={keyLabel('photo')}
        onSelect={run(props.onPhoto)}
      />
      <hr className="ui-rule" />
      <MenuOption icon="resort" label="Game" more onSelect={() => onOpen('game')} />
      <MenuOption icon="windows" label="Windows" more onSelect={() => onOpen('windows')} />
      <MenuOption icon="overlay" label="View" more onSelect={() => onOpen('view')} />
      <WeatherRow clock={clock} onOpen={onOpen} />
      <MenuOption
        icon="settings"
        label="Settings"
        value={sound.prefs.on ? undefined : 'muted'}
        more
        onSelect={() => onOpen('settings')}
      />
    </>
  );
}

const PAGES: { readonly [page in SubPage]: (props: PageProps) => ReactNode } = {
  game: ({ windows, run }) => (
    <>
      <MenuOption
        icon="resort"
        label="New game…"
        onSelect={run(() => windows.show('resort', true))}
      />
      <MenuOption label="Load game…" onSelect={run(() => windows.show('saves', true))} />
      <MenuOption
        icon="rename"
        label="Rename resort…"
        onSelect={run(() => windows.show('name', true))}
      />
      <MenuOption
        icon="share"
        label="Share resort…"
        onSelect={run(() => windows.show('share', true))}
      />
    </>
  ),
  windows: ({ windows, debug }) => (
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
      {debug ? (
        <>
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
            icon={pageIcon('actions')}
            label={DEBUG_ACTIONS.label}
            note={DEBUG_ACTIONS.note}
            many
            checked={isShown(windows.layout, 'actions')}
            onSelect={() => windows.toggle('actions')}
          />
        </>
      ) : null}
    </>
  ),
  // Not layers: these stand over whichever layer the map view has on, or none.
  view: ({ view, highlights, overlay, onOpen }) => (
    <>
      <MenuOption
        label="Problem markers"
        checked={view.markers}
        many
        onSelect={() => view.onMarkersChange(!view.markers)}
      />
      <MenuOption
        label="Building signs"
        shortcut={keyLabel('signs')}
        checked={view.signs}
        many
        onSelect={() => view.onSignsChange(!view.signs)}
      />
      <MenuOption
        label="Staff pins"
        shortcut={keyLabel('staffPins')}
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
  // A day leads on to the programme, which shows the same weather beside what is on.
  weather: ({ forecast, clock, windows, run }) =>
    daysAhead(forecast).map((each, at) => (
      <MenuOption
        key={each.day}
        icon={each.weather}
        label={forecastLabel(each, at === 0)}
        note={
          at === 0 && clock.forcedWeather
            ? 'pinned in the debug panel'
            : WEATHER_NOTES[each.weather]
        }
        onSelect={run(() => windows.show('programme', true))}
      />
    )),
  settings: ({ sound, look, shortcuts, pauses }) => (
    <>
      <MenuGroup label="Sound">
        <SoundOptions prefs={sound.prefs} onChange={sound.setPrefs} />
      </MenuGroup>
      <MenuGroup label="Look">
        <LookOptions {...look} />
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
      <MenuGroup label="Pause the game">
        {PAUSES.map(([pause, label, note]) => (
          <MenuOption
            key={pause}
            label={label}
            note={note}
            checked={pauses.prefs[pause]}
            many
            onSelect={() => pauses.onChange(pause, !pauses.prefs[pause])}
          />
        ))}
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
      <MenuPages {...props} run={run} />
    </DropdownMenu>
  );
}
