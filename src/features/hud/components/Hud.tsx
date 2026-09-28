import type { ReactNode, RefObject } from 'react';
import { AdvicePanel } from './AdvicePanel';
import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { CommandPalette } from './CommandPalette';
import { listCommands } from './commands';
import { CameraPanel } from './CameraPanel';
import { GuestsPanel } from './GuestsPanel';
import { HudError } from './HudError';
import { HudWindow, type HudWindowFrame } from './HudWindow';
import { InspectPanel } from './InspectPanel';
import { LedgerPanel } from './LedgerPanel';
import { RenderStats, type DebugElements } from './RenderStats';
import { ResortStats } from './ResortStats';
import { TopBar, type MenuId } from './TopBar';
import { NewGamePanel } from '../../welcome/components/NewGamePanel';
import { SavesPanel } from '../../saves/components/SavesPanel';
import { readableById, UNSAVED_ID } from '../../saves/domain/saveSlots';
import { WINDOW_ICONS, WINDOW_TITLES } from './windowNames';
import { depthOf, isOpen, type WindowId } from '../domain/windowLayout';
import type { BuildTool } from '../../build/domain/buildTool';
import type { SelectionView } from '../../inspect/domain/selection';
import type { Advice } from '../../sim/domain/advice';
import type { Ledger } from '../../sim/domain/ledger';
import type { CameraControls } from '../../../app/useCameraControls';
import type { ClockControls } from '../../../app/useClockControls';
import type { OverlayControls } from '../../../app/useOverlay';
import type { ResortControls } from '../../../app/useResortControls';
import type { SaveControls } from '../../../app/useSaves';
import type { WindowControls } from '../../../app/useWindows';
import type { ShowcaseStats, VoicesView } from '../../../app/showcase';

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
  readonly voices: VoicesView;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly ledger: Ledger | null;
  readonly preview: PreviewLookup;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly selection: SelectionView | null;
  readonly inspectElement: RefObject<HTMLSpanElement | null>;
  readonly onSelectPerson: (person: number) => void;
  readonly onClearSelection: () => void;
  readonly windows: WindowControls;
  readonly menu: MenuId | null;
  readonly onMenuChange: (menu: MenuId | null) => void;
  readonly palette: boolean;
  readonly onPaletteChange: (open: boolean) => void;
  readonly error: string | null;
  readonly refusal: string | null;
}

type Panel = Exclude<WindowId, 'inspect'>;

const PANELS: readonly Panel[] = [
  'build',
  'overview',
  'advice',
  'guests',
  'books',
  'camera',
  'resort',
  'saves',
  'debug',
];

// Null when a window has nothing to show yet, such as the generator before the first resort.
const CONTENT: { readonly [panel in Panel]: (props: HudProps) => ReactNode } = {
  build: (props) => (
    <BuildPalette
      preview={props.preview}
      tool={props.tool}
      onToolChange={props.onToolChange}
      ledger={props.ledger}
      focusSearch={props.windows.layout.focus === 'build'}
    />
  ),
  overview: (props) => <ResortStats stats={props.stats} />,
  advice: (props) => <AdvicePanel advice={props.advice} onShowOnPlot={props.onShowOnPlot} />,
  guests: (props) => <GuestsPanel voices={props.voices} />,
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
  saves: ({ saves }) => <SavesPanel saves={saves} />,
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
        activityElement={props.inspectElement}
        onSelectPerson={props.onSelectPerson}
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

export function Hud(props: HudProps) {
  return (
    <div className="hud">
      <TopBar
        timeElement={props.timeElement}
        clockElement={props.clockElement}
        clock={props.clock}
        resort={props.resort}
        saves={props.saves}
        overlay={props.overlay}
        ledger={props.ledger}
        adviceCount={props.advice.length}
        windows={props.windows}
        menu={props.menu}
        onMenuChange={props.onMenuChange}
        onFind={() => props.onPaletteChange(true)}
      />
      <Windows {...props} />
      <Palette {...props} />
      {props.error ? <HudError message={props.error} /> : null}
      {!props.error && props.refusal ? (
        <HudError title="Not enough money" message={props.refusal} />
      ) : null}
    </div>
  );
}
