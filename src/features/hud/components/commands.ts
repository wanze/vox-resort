import { speedNote, WEATHER_NAMES, WEATHER_NOTES } from './controlNames';
import { MENU_PAGES, pageIcon, pageKey, pageTitle } from './windowNames';
import type { IconName } from '../../../shared/components/pixelIcons';
import type { PreviewLookup } from './BuildPalette';
import { OVERLAY_NAMES, OVERLAY_QUESTIONS } from '../../overlays/components/overlayNames';
import { OVERLAY_KINDS } from '../../overlays/domain/overlays';
import { highlightIconOf } from '../../highlights/components/highlightIcons';
import { canPick, HIGHLIGHT_COLOURS } from '../../highlights/domain/highlights';
import { objectTypeGroups } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import {
  armedBrush,
  armedLand,
  armedObject,
  armedRemove,
  BULLDOZER,
  type BuildTool,
} from '../../build/domain/buildTool';
import { LAND_TOOL, landToolLabel } from '../../land/components/landTool';
import type { LandView } from '../../land/domain/landRights';
import { cycledTool, pickLabel, styleStripFor } from '../../build/domain/stylePick';
import { TERRAIN_BRUSHES } from '../../build/domain/terrainBrush';
import { TOOL_ART, type ToolArtKey } from '../../build/domain/toolArt';
import { COMPASS_DIRECTIONS, type CompassDirection } from '../../layout/domain/worldBounds';
import { SIM_SPEEDS, SPEED_LABELS } from '../../sim/domain/simClock';
import { WEATHERS } from '../../sim/domain/weather';
import { canAfford, type Ledger } from '../../sim/domain/ledger';
import { footprintLabel } from '../domain/paletteFilter';
import { keyLabel } from '../domain/keymap';
import { isOpen, isShown, type PageId } from '../domain/windowLayout';
import type { Searchable } from '../domain/commandSearch';
import { isReadable, listOrder, saveOrAsk } from '../../saves/domain/saveSlots';
import { savedAgo, titleOf } from '../../saves/domain/saveWords';
import { SAVE_SHORTCUT } from './MainMenu';
import type { HighlightControls } from '../../highlights/components/highlightControls';
import type { SelectionView } from '../../inspect/domain/selection';
import type {
  CameraControls,
  ClockControls,
  GuestViewControls,
  HistoryControls,
  ResortControls,
  SoundControls,
  WindowControls,
} from './hudControls';
import type { OverlayControls } from '../../overlays/components/overlayControls';
import type { SaveControls } from '../../saves/components/saveControls';
import type { PhotoControls } from '../../photo/components/photoControls';

export type CommandArt =
  | { readonly icon: IconName }
  | { readonly picture: string }
  | { readonly glyph: string };

export interface Command extends Searchable {
  readonly id: string;
  readonly note?: string;
  readonly art?: CommandArt | undefined;
  readonly shortcut?: string | undefined;
  readonly checked?: boolean;
  readonly run: () => void;
}

export interface CommandContext {
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
  readonly saves: SaveControls;
  readonly overlay: OverlayControls;
  readonly highlights: HighlightControls;
  readonly windows: WindowControls;
  readonly history: HistoryControls;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly ledger: Ledger | null;
  readonly land: LandView | null;
  readonly preview: PreviewLookup;
  readonly sound: SoundControls;
  readonly guestView: GuestViewControls;
  readonly photo: PhotoControls;
  readonly selection: SelectionView | null;
}

const CORNER_NAMES: { readonly [direction in CompassDirection]: string } = {
  northeast: 'north-east',
  southeast: 'south-east',
  southwest: 'south-west',
  northwest: 'north-west',
};

function speedCommands({ clock }: CommandContext): Command[] {
  return SIM_SPEEDS.map((speed) => ({
    id: `speed:${speed}`,
    label: SPEED_LABELS[speed],
    group: 'Speed',
    keywords: 'game time clock',
    note: speedNote(speed),
    art: { icon: speed },
    shortcut: speed === 'paused' ? keyLabel('pause') : undefined,
    checked: clock.speed === speed,
    run: () => clock.setSpeed(speed),
  }));
}

function weatherCommands({ clock }: CommandContext): Command[] {
  const forecast: Command = {
    id: 'weather:forecast',
    label: 'Forecast',
    group: 'Weather',
    note: "let the week's own weather run",
    art: { icon: 'forecast' },
    checked: clock.forcedWeather === null,
    run: () => clock.setWeather(null),
  };
  return [
    forecast,
    ...WEATHERS.map((weather) => ({
      id: `weather:${weather}`,
      label: WEATHER_NAMES[weather],
      group: 'Weather',
      keywords: 'pin',
      note: WEATHER_NOTES[weather],
      art: { icon: weather },
      checked: clock.forcedWeather === weather,
      run: () => clock.setWeather(weather),
    })),
  ];
}

function overlayCommands({ overlay }: CommandContext): Command[] {
  const off: Command = {
    id: 'overlay:off',
    label: 'Off',
    group: 'Map view',
    keywords: 'overlay none',
    note: 'show the resort as it is',
    art: { icon: 'overlay' },
    checked: overlay.kind === null,
    run: () => overlay.setOverlay(null),
  };
  return [
    off,
    ...OVERLAY_KINDS.map((kind) => ({
      id: `overlay:${kind}`,
      label: OVERLAY_NAMES[kind],
      group: 'Map view',
      keywords: `overlay heatmap ${kind}`,
      note: OVERLAY_QUESTIONS[kind],
      art: { icon: 'overlay' as const },
      checked: overlay.kind === kind,
      run: () => overlay.setOverlay(kind),
    })),
  ];
}

// A full set says so rather than greying the row out: the palette has no disabled rows.
function highlightCommands({ highlights }: CommandContext): Command[] {
  const { types, picks } = highlights;
  const room = canPick(picks);
  const clear: Command = {
    id: 'highlight:clear',
    label: 'Clear highlights',
    group: 'Highlight',
    keywords: 'highlight reset none off remove all',
    note: 'show every building alike',
    art: { icon: 'inspect' },
    checked: picks.length === 0,
    run: highlights.clear,
  };
  return [
    clear,
    ...types.map((type) => {
      const picked = picks.some((pick) => pick.family === type.family);
      return {
        id: `highlight:${type.family}`,
        label: `Highlight ${type.label}`,
        group: 'Highlight',
        keywords: `find where show mark ${type.family} ${type.sign ?? 'lodging'}`,
        note:
          picked || room
            ? `${type.count} built`
            : `${HIGHLIGHT_COLOURS.length} kinds are highlighted already`,
        art: { icon: highlightIconOf(type) },
        checked: picked,
        run: () => highlights.toggle(type.family),
      };
    }),
  ];
}

// A corner also switches into isometric, where the panel would first make the player do it by hand.
function cameraCommands({ camera, photo }: CommandContext): Command[] {
  const { view } = camera;
  const isometric = view.mode === 'isometric';
  return [
    {
      id: 'camera:perspective',
      label: 'Perspective',
      group: 'Camera',
      keywords: 'view fly',
      art: { icon: 'camera' },
      shortcut: keyLabel('cameraMode'),
      checked: !isometric,
      run: () => camera.setMode('perspective'),
    },
    ...COMPASS_DIRECTIONS.map((direction) => ({
      id: `camera:${direction}`,
      label: `Isometric from the ${CORNER_NAMES[direction]}`,
      group: 'Camera',
      keywords: `view corner turn ${direction}`,
      art: { icon: 'camera' as const },
      checked: isometric && view.direction === direction,
      run: () => {
        camera.setMode('isometric');
        camera.setDirection(direction);
      },
    })),
    {
      id: 'camera:detail',
      label: 'Level of detail',
      group: 'Camera',
      keywords: 'lod performance',
      note: 'draw far objects coarse and leave out ones too small to see',
      checked: view.detail,
      run: () => camera.setDetail(!view.detail),
    },
    {
      id: 'camera:photo',
      label: 'Photo mode',
      group: 'Camera',
      keywords: 'picture screenshot selfie snapshot',
      note: 'hide the HUD and take a picture',
      art: { icon: 'camera' },
      shortcut: keyLabel('photo'),
      run: photo.enter,
    },
  ];
}

function stopFollowing({ guestView }: CommandContext): Command[] {
  if (!guestView.following) return [];
  return [
    {
      id: 'follow:stop',
      label: 'Stop following',
      group: 'Camera',
      keywords: 'follow guest leave back',
      note: 'back to your own camera',
      art: { icon: 'camera' },
      shortcut: keyLabel('follow'),
      run: guestView.stop,
    },
  ];
}

function followGuest({ guestView, selection }: CommandContext): Command[] {
  if (selection?.kind !== 'guest' || guestView.following) return [];
  return [
    {
      id: 'follow:guest',
      label: `Follow ${selection.name}`,
      group: 'Camera',
      keywords: 'follow guest walk along first third person eyes shoulder',
      note: 'from behind them, or through their eyes',
      art: { icon: 'camera' },
      shortcut: keyLabel('follow'),
      run: guestView.follow,
    },
  ];
}

// Only while a craft is out: the palette is built afresh each time it opens.
function rideCommands({ guestView }: CommandContext): Command[] {
  return guestView.offers().map((offer) => ({
    id: `ride:${offer.label}`,
    label: offer.label,
    group: 'Camera',
    keywords: 'ride boat sea water craft follow',
    note: 'until it comes back in',
    art: { icon: 'camera' as const },
    run: () => guestView.ride(offer.craft),
  }));
}

function soundCommands({ sound }: CommandContext): Command[] {
  const { on } = sound.prefs;
  return [
    {
      id: 'sound:toggle',
      label: on ? 'Mute sound' : 'Unmute sound',
      group: 'Sound',
      keywords: 'audio music volume mute quiet silence',
      note: on ? 'silence the music, the resort and the buttons' : 'bring the sound back',
      art: { icon: on ? 'muted' : 'sound' },
      shortcut: keyLabel('sound'),
      run: sound.toggle,
    },
  ];
}

function savesWindow(id: string, label: string, note: string, windows: WindowControls): Command {
  return {
    id,
    label,
    group: 'Game',
    keywords: 'save load saved game file',
    note,
    art: { icon: 'saves' },
    run: () => windows.show('saves', true),
  };
}

// Nothing here deletes: that is asked about in the list, where the save being deleted is in view.
function gameCommands({ saves, windows }: CommandContext): Command[] {
  const now = Date.now();
  const loads = listOrder(saves.saves)
    .filter(isReadable)
    .map((meta) => ({
      id: `game:load:${meta.id}`,
      label: `Load ${titleOf(meta)}`,
      group: 'Game',
      keywords: 'load saved game continue open',
      note: `day ${meta.day}, saved ${savedAgo(meta.savedAt, now)}`,
      art: { icon: 'saves' as const },
      run: () => void saves.load(meta.id),
    }));
  return [
    {
      id: 'game:save',
      label: 'Save game',
      group: 'Game',
      keywords: 'save keep write',
      note: saves.current?.name ?? 'name it first',
      art: { icon: 'saves' },
      shortcut: SAVE_SHORTCUT,
      run: () => void saveOrAsk(saves.save, () => windows.show('saves', true)),
    },
    savesWindow('game:save-as', 'Save as…', 'keep a copy under a new name', windows),
    savesWindow('game:load', 'Load game…', 'every saved game, newest first', windows),
    ...loads,
    savesWindow('game:delete', 'Delete a saved game…', 'in the list of saved games', windows),
  ];
}

function resortCommands({ resort, windows }: CommandContext): Command[] {
  return [
    {
      id: 'resort:gates',
      label: resort.open ? 'Close the gates' : 'Open the gates',
      group: 'Resort',
      keywords: 'open closed guests entrance',
      note: resort.open ? 'turn new guests away' : 'let new guests in',
      art: { icon: 'guests' },
      run: () => resort.setOpen(!resort.open),
    },
    {
      id: 'resort:new',
      label: 'New game…',
      group: 'Resort',
      keywords: 'generate clear start resort tycoon free play sandbox',
      note: 'tycoon or free play, on bare land or a generated resort',
      art: { icon: 'resort' },
      run: () => windows.show('resort', true),
    },
    {
      id: 'resort:rename',
      label: 'Rename resort…',
      group: 'Resort',
      keywords: 'name title sign',
      note: resort.name ?? 'give the resort a name',
      art: { icon: 'resort' },
      run: () => windows.show('name', true),
    },
    {
      id: 'resort:share',
      label: 'Share resort…',
      group: 'Resort',
      keywords: 'link copy send layout friend url',
      note: 'a link to its layout',
      art: { icon: 'share' },
      run: () => windows.show('share', true),
    },
  ];
}

const PAGE_HINTS: { readonly [page in PageId]?: Pick<Command, 'keywords' | 'note'> } = {
  report: {
    keywords: 'window summary yesterday history day check-in chart trend',
    note: 'the last fourteen days, closed each morning at check-in',
  },
};

// The report opens on the newest day, as the Overview opens it, unless it is already showing.
function pageCommand(page: PageId, { windows, history }: CommandContext): Command {
  const shown = isShown(windows.layout, page);
  return {
    id: `window:${page}`,
    label: pageTitle(page),
    group: 'Windows',
    keywords: 'window panel show hide',
    ...PAGE_HINTS[page],
    art: { icon: pageIcon(page) },
    shortcut: pageKey(page),
    checked: shown,
    run: () => {
      if (page === 'report' && !shown) history.show(null);
      windows.toggle(page);
    },
  };
}

function windowCommands(context: CommandContext): Command[] {
  const { windows } = context;
  return [
    ...MENU_PAGES.map((page) => pageCommand(page, context)),
    {
      id: 'window:debug',
      label: 'Debug info',
      group: 'Windows',
      keywords: 'window stats fps frame rate performance',
      note: 'frame rate, frame cost and what is drawn',
      art: { icon: 'debug' },
      shortcut: keyLabel('debug'),
      checked: isOpen(windows.layout, 'debug'),
      run: () => windows.toggle('debug'),
    },
    {
      id: 'window:reset',
      label: 'Reset window positions',
      group: 'Windows',
      note: 'put every window back where it started',
      run: windows.resetPlaces,
    },
  ];
}

// The glyph until `pnpm preview` has drawn the tool, as an object falls back to no picture.
function toolArt(preview: PreviewLookup, key: ToolArtKey, glyph: string): CommandArt {
  const picture = preview(TOOL_ART[key]);
  return picture ? { picture } : { glyph };
}

function priceNote(cost: number, ledger: Ledger | null): string {
  const price = `costs ${cost.toLocaleString('en-US')}`;
  return ledger !== null && !canAfford(ledger, cost) ? `${price}, more than the bank holds` : price;
}

// None on a plot that owns all of itself, as on every generated one.
function landCommands({ tool, onToolChange, land, preview }: CommandContext): Command[] {
  if (!land || land.forSale === 0) return [];
  return [
    {
      id: 'tool:land',
      label: landToolLabel(land),
      group: 'Build',
      keywords: 'land parcel buy claim plot expand grow',
      note: LAND_TOOL.hint,
      art: toolArt(preview, 'land', LAND_TOOL.glyph),
      shortcut: keyLabel('land'),
      checked: armedLand(tool),
      run: () => onToolChange({ kind: 'land' }),
    },
  ];
}

function toolCommands({ tool, onToolChange, preview }: CommandContext): Command[] {
  const brush = armedBrush(tool);
  const brushes: Command[] = TERRAIN_BRUSHES.map((entry) => ({
    id: `terrain:${entry.id}`,
    label: entry.label,
    group: 'Build',
    keywords: 'terrain ground brush',
    note: entry.hint,
    art: toolArt(preview, entry.id, entry.glyph),
    checked: brush === entry.id,
    run: () => onToolChange({ kind: 'terrain', brush: entry.id }),
  }));
  const bulldozer: Command = {
    id: 'tool:remove',
    label: BULLDOZER.label,
    group: 'Build',
    keywords: 'remove delete demolish clear',
    note: BULLDOZER.hint,
    art: toolArt(preview, 'remove', BULLDOZER.glyph),
    checked: armedRemove(tool),
    run: () => onToolChange({ kind: 'remove' }),
  };
  const disarm: Command[] =
    tool === null
      ? []
      : [
          {
            id: 'tool:none',
            label: 'Stop building',
            group: 'Build',
            keywords: 'cancel disarm put down',
            shortcut: keyLabel('cancel'),
            run: () => onToolChange(null),
          },
        ];
  return [...disarm, bulldozer, ...brushes];
}

function objectCommands({ tool, onToolChange, ledger, preview }: CommandContext): Command[] {
  const armed = armedObject(tool);
  return objectTypeGroups().flatMap((group) =>
    group.types.map((type) => {
      const picture = preview(type.id);
      return {
        id: `object:${type.id}`,
        label: type.label,
        group: 'Build',
        keywords: `${group.label} ${type.id} place`,
        note: `${group.label}, ${footprintLabel(type)} tiles, ${priceNote(buildCostOf(type.id), ledger)}`,
        art: picture ? { picture } : undefined,
        checked: armed === type.id,
        run: () => onToolChange({ kind: 'object', id: type.id }),
      };
    }),
  );
}

function styleCommands({ tool, onToolChange }: CommandContext): Command[] {
  const strip = styleStripFor(tool);
  const next = cycledTool(tool);
  if (!strip || !next) return [];
  return [
    {
      id: 'tool:next-style',
      label: 'Next style',
      group: 'Build',
      keywords: 'style variant look cycle',
      note: pickLabel(strip),
      shortcut: keyLabel('nextStyle'),
      run: () => onToolChange(next),
    },
  ];
}

// Controls first and the catalogue last, so an empty box opens on the handful of switches.
export function listCommands(context: CommandContext): readonly Command[] {
  return [
    ...speedCommands(context),
    ...weatherCommands(context),
    ...overlayCommands(context),
    ...highlightCommands(context),
    ...cameraCommands(context),
    ...stopFollowing(context),
    ...followGuest(context),
    ...rideCommands(context),
    ...soundCommands(context),
    ...gameCommands(context),
    ...resortCommands(context),
    ...windowCommands(context),
    ...toolCommands(context),
    ...landCommands(context),
    ...styleCommands(context),
    ...objectCommands(context),
  ];
}
