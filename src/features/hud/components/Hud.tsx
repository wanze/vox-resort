import type { ReactNode, RefObject } from 'react';
import { AdvicePanel } from './AdvicePanel';
import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { CommandPalette } from './CommandPalette';
import { listCommands } from './commands';
import { CameraPanel } from './CameraPanel';
import { DayReportPanel } from './DayReportPanel';
import { DemandPanel } from './DemandPanel';
import { GuestsPanel } from './GuestsPanel';
import { HudError } from './HudError';
import { HudWindow, type HudWindowFrame } from './HudWindow';
import { InspectPanel } from './InspectPanel';
import { LedgerPanel } from './LedgerPanel';
import { MessagesPanel } from './MessagesPanel';
import { ProblemMarkers } from './ProblemMarkers';
import { StaffPins } from './StaffPins';
import { VenueSigns } from './VenueSigns';
import { RenderStats, type DebugElements } from './RenderStats';
import { ResortNameForm } from './ResortNameForm';
import { ResortStats } from './ResortStats';
import { StaffPanel } from './StaffPanel';
import { Toasts } from './Toasts';
import { TopBar, type MenuId } from './TopBar';
import { NewGamePanel } from '../../welcome/components/NewGamePanel';
import { SavesPanel } from '../../saves/components/SavesPanel';
import { readableById, UNSAVED_ID } from '../../saves/domain/saveSlots';
import { WINDOW_ICONS, WINDOW_TITLES } from './windowNames';
import { depthOf, isOpen, type WindowId } from '../domain/windowLayout';
import type { BuildTool } from '../../build/domain/buildTool';
import type { SelectionView } from '../../inspect/domain/selection';
import type { Advice } from '../../sim/domain/advice';
import { starsTrend } from '../../sim/domain/dayReport';
import type { GameMode, Ledger } from '../../sim/domain/ledger';
import type { LandView } from '../../land/domain/landRights';
import type { StaffRole } from '../../sim/domain/staff';
import type { OrderRole } from '../../sim/domain/staffRouter';
import { markersOf, type OrderSpot } from '../domain/markers';
import type { SignSpot } from '../domain/signs';
import type { UpdateAction } from '../domain/news';
import type { CameraControls } from '../../../app/useCameraControls';
import type { ClockControls } from '../../../app/useClockControls';
import type { HistoryControls } from '../../../app/useHistory';
import type { NewsControls } from '../../../app/useNews';
import type { OverlayControls } from '../../../app/useOverlay';
import type { ResortControls } from '../../../app/useResortControls';
import type { SaveControls } from '../../../app/useSaves';
import type { SoundControls } from '../../../app/useSound';
import type { WindowControls } from '../../../app/useWindows';
import type { ShowcaseStats, StatusView, VoicesView } from '../../../app/showcase';

export interface HudProps {
  readonly stats: ShowcaseStats | null;
  readonly debugElements: DebugElements;
  readonly timeElement: RefObject<HTMLInputElement | null>;
  readonly clockElement: RefObject<HTMLSpanElement | null>;
  readonly clock: ClockControls;
  readonly camera: CameraControls;
  readonly resort: ResortControls;
  readonly saves: SaveControls;
  readonly overlay: OverlayControls;
  readonly advice: readonly Advice[];
  readonly news: NewsControls;
  readonly onUpdate: (action: UpdateAction) => void;
  readonly voices: VoicesView;
  readonly status: StatusView | null;
  readonly history: HistoryControls;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly markerElements: RefObject<(HTMLElement | null)[]>;
  readonly staffPinElements: RefObject<(HTMLButtonElement | null)[]>;
  readonly signs: readonly SignSpot[];
  readonly signElements: RefObject<(HTMLElement | null)[]>;
  readonly signsNamed: boolean;
  readonly onSelectWorker: (worker: number) => void;
  readonly onSelectAt: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly ledger: Ledger | null;
  readonly land: LandView | null;
  readonly preview: PreviewLookup;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly selection: SelectionView | null;
  readonly inspectElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  readonly onShowSelected: () => void;
  readonly orders: readonly OrderSpot[];
  readonly onSend: (role: OrderRole) => void;
  readonly onSendCleanerTo: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onRenameVenue: (key: string, name: string) => void;
  readonly onClearSelection: () => void;
  readonly windows: WindowControls;
  readonly menu: MenuId | null;
  readonly onMenuChange: (menu: MenuId | null) => void;
  readonly palette: boolean;
  readonly onPaletteChange: (open: boolean) => void;
  readonly sound: SoundControls;
  readonly error: string | null;
  readonly refusal: { readonly title: string; readonly message: string } | null;
}

type Panel = Exclude<WindowId, 'inspect'>;

const PANELS: readonly Panel[] = [
  'build',
  'overview',
  'advice',
  'messages',
  'report',
  'demand',
  'guests',
  'staff',
  'books',
  'camera',
  'resort',
  'name',
  'saves',
  'debug',
];

const modeOf = (ledger: Ledger | null): GameMode | null => ledger?.mode ?? null;

// Tops the role up to what the plot wants and keeps it hand-set.
const hireUpTo = (props: HudProps, role: StaffRole): void =>
  props.resort.setHiring(role, props.stats?.staff.recommended[role] ?? null);

// null for the newest, which is where the Overview and the palette open it.
const openReport = (props: Pick<HudProps, 'history' | 'windows'>, day: number | null): void => {
  props.history.show(day);
  props.windows.show('report', true);
};

// Null when a window has nothing to show yet, such as the generator before the first resort.
const CONTENT: { readonly [panel in Panel]: (props: HudProps) => ReactNode } = {
  build: (props) => (
    <BuildPalette
      preview={props.preview}
      tool={props.tool}
      onToolChange={props.onToolChange}
      ledger={props.ledger}
      land={props.land}
      focusSearch={props.windows.layout.focus === 'build'}
      zoneStaff={props.stats?.staff.zones ?? null}
    />
  ),
  overview: (props) => (
    <ResortStats
      stats={props.stats}
      status={props.status}
      onOpenReport={() => openReport(props, null)}
    />
  ),
  advice: (props) => (
    <AdvicePanel
      advice={props.advice}
      onShowOnPlot={props.onShowOnPlot}
      onHire={(role) => hireUpTo(props, role)}
    />
  ),
  messages: (props) => (
    <MessagesPanel
      log={props.news.log}
      prefs={props.news.prefs}
      history={props.history.history}
      mode={modeOf(props.ledger)}
      onMutedChange={props.news.setMuted}
      onShowOnPlot={props.onShowOnPlot}
      onOpenReport={(day) => openReport(props, day)}
    />
  ),
  report: ({ history, ledger, resort }) => (
    <DayReportPanel
      history={history.history}
      shown={history.shown}
      onShow={history.show}
      mode={modeOf(ledger)}
      resortName={resort.name}
    />
  ),
  demand: ({ status }) => <DemandPanel status={status} />,
  guests: (props) => <GuestsPanel voices={props.voices} />,
  staff: ({ stats, status, resort }) => (
    <StaffPanel staff={stats?.staff ?? null} tally={status?.staff} onHire={resort.setHiring} />
  ),
  books: (props) => <LedgerPanel ledger={props.ledger} />,
  camera: ({ camera }) => (
    <CameraPanel
      mode={camera.view.mode}
      direction={camera.view.direction}
      detail={camera.view.detail}
      onModeChange={camera.setMode}
      onDirectionChange={camera.setDirection}
      onDetailChange={camera.setDetail}
    />
  ),
  resort: ({ resort, saves, windows }) =>
    resort.params ? (
      <NewGamePanel
        params={resort.params}
        onStart={(params, game) =>
          void resort.start(params, game).then((built) => {
            if (built) windows.show('resort', false);
          })
        }
        busy={resort.building}
        unsaved={readableById(saves.saves, UNSAVED_ID)}
        onKeepUnsaved={saves.nameUnsaved}
      />
    ) : null,
  // Keyed on the name, so a load or a rename elsewhere fills the field afresh.
  name: ({ resort }) =>
    resort.name === null ? null : (
      <ResortNameForm key={resort.name} name={resort.name} onRename={resort.rename} />
    ),
  saves: ({ saves, resort }) => <SavesPanel saves={saves} resortName={resort.name} />,
  debug: (props) => <RenderStats stats={props.stats} elements={props.debugElements} />,
};

function frameOf(windows: WindowControls, id: WindowId, onClose: () => void): HudWindowFrame {
  return {
    id,
    spot: windows.layout.spots[id] ?? null,
    depth: depthOf(windows.layout, id),
    onRaise: () => windows.raise(id),
    onMove: (spot) => windows.move(id, spot),
    onClose,
  };
}

function Windows(props: HudProps) {
  const { windows } = props;
  return (
    <>
      {PANELS.filter((panel) => isOpen(windows.layout, panel)).map((panel) => {
        const content = CONTENT[panel](props);
        if (content === null) return null;
        return (
          <HudWindow
            key={panel}
            frame={frameOf(windows, panel, () => windows.show(panel, false))}
            title={WINDOW_TITLES[panel]}
            icon={WINDOW_ICONS[panel]}
          >
            {content}
          </HudWindow>
        );
      })}
      <InspectPanel
        frame={frameOf(windows, 'inspect', props.onClearSelection)}
        selection={props.selection}
        advice={props.advice}
        activityElement={props.inspectElement}
        onSelectPerson={props.onSelectPerson}
        onShow={props.onShowSelected}
        onSend={props.onSend}
        onRenameVenue={props.onRenameVenue}
      />
    </>
  );
}

// Built only while open, and afresh each time, so every tick and check mark reads the current state.
function Palette(props: HudProps) {
  if (!props.palette) return null;
  return (
    <CommandPalette commands={listCommands(props)} onClose={() => props.onPaletteChange(false)} />
  );
}

// The same list ProblemMarkers draws, so a sign gives way only to a marker that is showing.
const markedTiles = (props: HudProps) =>
  props.news.prefs.markers ? markersOf(props.advice).map((marker) => marker.at) : [];

export function Hud(props: HudProps) {
  return (
    <div className="hud">
      <VenueSigns
        spots={props.signs}
        shown={props.news.prefs.signs}
        named={props.signsNamed}
        marked={markedTiles(props)}
        elements={props.signElements}
        onSelectAt={props.onSelectAt}
      />
      <StaffPins elements={props.staffPinElements} onSelectWorker={props.onSelectWorker} />
      <ProblemMarkers
        advice={props.advice}
        shown={props.news.prefs.markers}
        elements={props.markerElements}
        onShowOnPlot={props.onShowOnPlot}
        onSelectAt={props.onSelectAt}
        orders={props.orders}
        onSendCleaner={props.onSendCleanerTo}
      />
      <TopBar
        timeElement={props.timeElement}
        clockElement={props.clockElement}
        clock={props.clock}
        resort={props.resort}
        saves={props.saves}
        overlay={props.overlay}
        ledger={props.ledger}
        status={props.status}
        trend={starsTrend(props.history.history)}
        adviceCount={props.advice.length}
        windows={props.windows}
        menu={props.menu}
        onMenuChange={props.onMenuChange}
        onFind={() => props.onPaletteChange(true)}
        markers={props.news.prefs.markers}
        onMarkersChange={props.news.setMarkers}
        staffPins={props.news.prefs.staff}
        onStaffPinsChange={props.news.setStaffPins}
        signs={props.news.prefs.signs}
        onSignsChange={props.news.setSigns}
        sound={props.sound}
      />
      <Windows {...props} />
      <Toasts
        toasts={props.news.toasts}
        onUpdate={props.onUpdate}
        news={{
          history: props.history.history,
          mode: modeOf(props.ledger),
          onShowOnPlot: props.onShowOnPlot,
          onHire: (role) => hireUpTo(props, role),
          onOpenAdvice: () => props.windows.show('advice', true),
          onOpenReport: (day) => openReport(props, day),
          onDismiss: props.news.dismiss,
        }}
      />
      <Palette {...props} />
      {props.error ? <HudError message={props.error} /> : null}
      {!props.error && props.refusal ? (
        <HudError title={props.refusal.title} message={props.refusal.message} />
      ) : null}
    </div>
  );
}
