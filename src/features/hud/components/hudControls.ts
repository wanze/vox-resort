import type { LandView } from '../../land/domain/landRights';
import type { CameraMode, CompassDirection } from '../../layout/domain/worldBounds';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import type { SharedResort } from '../../sharing/domain/sharedResort';
import type { Advice } from '../../sim/domain/advice';
import type { DayReport } from '../../sim/domain/dayReport';
import type { Ledger } from '../../sim/domain/ledger';
import type { SimSpeed } from '../../sim/domain/simClock';
import type { StaffRole } from '../../sim/domain/staff';
import type { Weather } from '../../sim/domain/weather';
import type { Cue } from '../../sound/domain/cues';
import type { HeardScene } from '../../sound/domain/hearing';
import type { SoundPrefs } from '../../sound/domain/soundPrefs';
import type { NewGame } from '../../welcome/domain/newGame';
import type { HudPrefs } from '../domain/hudPrefs';
import type { EventNews, Message, Toast, ToastKind, UpdatePhase } from '../domain/news';
import type { BuildNote, CameraView } from '../domain/views';
import type { PageId, WindowId, WindowLayout, WindowSpot } from '../domain/windowLayout';
import type { TabbedWindow, TabId } from '../domain/windowTabs';
import type { SelectionView } from '../../inspect/domain/selection';
import type { OrderRole } from '../../sim/domain/staffRouter';
import type { HighlightControls } from '../../highlights/components/highlightControls';
import type { OverlayControls } from '../../overlays/components/overlayControls';
import type { ProgrammeControls } from '../../events/components/programmeControls';
import type { SaveControls } from '../../saves/components/saveControls';

// The scene owns the camera and keys move it without React, so the view is what the scene tells.
export interface CameraControls {
  readonly view: CameraView;
  setMode(mode: CameraMode): void;
  setDirection(direction: CompassDirection): void;
  setDetail(enabled: boolean): void;
}

// The time is not held here: it changes every frame, so hudOverlay writes it straight to the DOM.
export interface ClockControls {
  readonly speed: SimSpeed;
  readonly weather: Weather;
  readonly forcedWeather: Weather | null;
  setSpeed(speed: SimSpeed): void;
  togglePause(): void;
  setWeather(weather: Weather | null): void;
  // For a clock the showcase set itself, as a load does; nothing is sent back to it.
  adoptSpeed(speed: SimSpeed): void;
  adoptForced(weather: Weather | null): void;
}

export interface HistoryControls {
  readonly history: readonly DayReport[];
  // The day the report window shows; null for the newest.
  readonly shown: number | null;
  readonly show: (day: number | null) => void;
  // The next history is a baseline: the reports a load brings were closed long ago.
  readonly reset: () => void;
}

export interface NewsControls {
  readonly toasts: readonly Toast[];
  readonly log: readonly Message[];
  readonly prefs: HudPrefs;
  hear(advice: readonly Advice[], ticks: number): void;
  closeDay(report: DayReport): void;
  hearEvent(news: EventNews): void;
  dismiss(key: string): void;
  setMuted(kind: ToastKind, muted: boolean): void;
  setMarkers(shown: boolean): void;
  setStaffPins(shown: boolean): void;
  setSigns(shown: boolean): void;
  setSingleKeys(on: boolean): void;
  setUpdate(phase: UpdatePhase | null): void;
  // The next advice is a baseline: a new resort's problems are not news.
  reset(): void;
}

export interface MoneyControls {
  readonly ledger: Ledger | null;
  readonly refusal: BuildNote | null;
  readonly land: LandView | null;
  readonly note: (note: BuildNote) => void;
}

export interface ResortControls {
  readonly params: ResortParams | null;
  readonly name: string | null;
  readonly building: boolean;
  readonly open: boolean;
  readonly money: MoneyControls;
  adopt(params: ResortParams): void;
  rename(name: string): void;
  setOpen(open: boolean): void;
  setHiring(role: StaffRole, count: number | null): void;
  // True once the new resort stands; false if it could not be built.
  start(params: ResortParams, game: NewGame): Promise<boolean>;
  // As start: true once the shared resort stands, false if it could not be built.
  openShared(shared: SharedResort): Promise<boolean>;
}

export interface SoundControls {
  readonly prefs: SoundPrefs;
  setPrefs(prefs: SoundPrefs): void;
  toggle(): void;
  cue(cue: Cue): void;
  hear(scene: HeardScene): void;
}

export interface WindowControls {
  readonly layout: WindowLayout;
  toggle(page: PageId): void;
  show(page: PageId, shown: boolean): void;
  raise(id: WindowId): void;
  move(id: WindowId, spot: WindowSpot): void;
  resetPlaces(): void;
  readonly tab: (id: TabbedWindow) => TabId;
}

// The scene owns the selection, since clicks land on the canvas; this only reads what it tells.
export interface InspectorControls {
  readonly selection: SelectionView | null;
  send(role: OrderRole): void;
  sendCleanerTo(tile: { readonly tileX: number; readonly tileZ: number }): void;
  renameVenue(key: string, name: string): void;
  selectPerson(person: number): void;
  selectWorker(worker: number): void;
  showSelected(): void;
  selectAt(tile: { readonly tileX: number; readonly tileZ: number }): void;
  clear(): void;
}

export interface HudControls {
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
  readonly saves: SaveControls;
  readonly overlay: OverlayControls;
  readonly highlights: HighlightControls;
  readonly news: NewsControls;
  readonly history: HistoryControls;
  readonly sound: SoundControls;
  readonly programme: ProgrammeControls;
  readonly windows: WindowControls;
}
