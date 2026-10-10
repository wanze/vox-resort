import { useEffect, useState, type ReactNode, type RefCallback } from 'react';
import { AdvicePanel } from './AdvicePanel';
import { ArmedChip } from './ArmedChip';
import { BuildPalette, type PreviewLookup } from './BuildPalette';
import { CommandPalette } from './CommandPalette';
import { listCommands } from './commands';
import { CameraPanel } from './CameraPanel';
import { DayReportPanel } from './DayReportPanel';
import { DemandPanel } from './DemandPanel';
import { PhotoWallPanel } from './PhotoWallPanel';
import { GuestsPanel } from './GuestsPanel';
import { HudError } from './HudError';
import { Tabs, tabIdOf } from '../../../shared/components/Tabs';
import type { HireControls } from './HireButton';
import { HudWindow, type HudWindowFrame } from './HudWindow';
import { InspectPanel } from './InspectPanel';
import { LedgerPanel } from './LedgerPanel';
import { MessagesPanel } from './MessagesPanel';
import { PlacementBar } from './PlacementBar';
import { PricesPanel } from './PricesPanel';
import { ProblemMarkers } from './ProblemMarkers';
import { StaffPins } from './StaffPins';
import { VenueSigns } from './VenueSigns';
import { RenderStats } from './RenderStats';
import { ResortNameForm } from './ResortNameForm';
import { ResortStats } from './ResortStats';
import { StaffPanel } from './StaffPanel';
import { Toasts } from './Toasts';
import { TopBar, type MenuId } from './TopBar';
import { NewGamePanel } from '../../welcome/components/NewGamePanel';
import { ProgrammePanel } from '../../events/components/ProgrammePanel';
import { SavesPanel } from '../../saves/components/SavesPanel';
import { readableById, slotsBusy, UNSAVED_ID } from '../../saves/domain/saveSlots';
import { SharePanel } from '../../sharing/components/SharePanel';
import { FollowCard, type FollowSheet } from '../../guest-view/components/FollowCard';
import { collapsedOnView } from '../../guest-view/domain/followSheet';
import type { ViewMode } from '../../guest-view/domain/followRig';
import { TAB_ICONS, TAB_TITLES, WINDOW_ICONS, WINDOW_TITLES } from './windowNames';
import { depthOf, isOpen, WINDOW_IDS, type PageId, type WindowId } from '../domain/windowLayout';
import { isTabbed, WINDOW_TABS, type TabbedWindow, type TabId } from '../domain/windowTabs';
import { isCompact, type LayoutMode } from '../domain/layoutMode';
import type { BuildTool } from '../../build/domain/buildTool';
import type { SelectionView } from '../../inspect/domain/selection';
import type { Advice } from '../../sim/domain/advice';
import { starsTrend } from '../../sim/domain/dayReport';
import type { GameMode, Ledger } from '../../sim/domain/ledger';
import type { LandView } from '../../land/domain/landRights';
import { hireOffer } from '../domain/hireOffer';
import { markersOf, type OrderSpot } from '../domain/markers';
import type { SignSpot } from '../domain/signs';
import type { UpdateAction } from '../domain/news';
import type { HudControls, InspectorControls } from './hudControls';
import type { HudNodes } from './hudNodes';
import { useHudSlice } from './useHudSlice';
import type { HudStore } from '../domain/hudStore';
import type { ShowcaseStats, StatusView, VoicesView } from '../domain/views';

interface HudPlacement {
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly preview: PreviewLookup;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly onTurn: (quarters: number) => void;
}

interface HudChrome {
  readonly layout: LayoutMode;
  // Folded by the app as its figures grow; written outside React, like the nodes.
  readonly bar: RefCallback<HTMLElement>;
  readonly menu: MenuId | null;
  readonly onMenuChange: (menu: MenuId | null) => void;
  readonly palette: boolean;
  readonly onPaletteChange: (open: boolean) => void;
  readonly error: string | null;
  readonly refusal: { readonly title: string; readonly message: string } | null;
  readonly onUpdate: (action: UpdateAction) => void;
  // Makes a link to the resort's layout; the Share window copies or sends it.
  readonly onShare: () => Promise<string>;
  readonly signsNamed: boolean;
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
}

export interface HudProps {
  readonly hud: HudStore;
  readonly nodes: HudNodes;
  readonly controls: HudControls;
  readonly placement: HudPlacement;
  readonly inspector: InspectorControls;
  readonly chrome: HudChrome;
}

interface HudSlices {
  readonly stats: ShowcaseStats | null;
  readonly advice: readonly Advice[];
  readonly voices: VoicesView;
  readonly status: StatusView | null;
  readonly signs: readonly SignSpot[];
  readonly selection: SelectionView | null;
  readonly orders: readonly OrderSpot[];
  readonly ledger: Ledger | null;
  readonly land: LandView | null;
  // A placement a finger left on the map, waiting for the bar's Place or Cancel.
  readonly pending: boolean;
}

// What the HUD's pieces read: the groups laid flat, beside what the store holds.
interface HudView extends HudControls, HudPlacement, HudChrome, HudSlices {
  readonly nodes: HudNodes;
  readonly inspector: InspectorControls;
}

function useHudSlices(hud: HudStore): HudSlices {
  return {
    stats: useHudSlice(hud, (state) => state.stats),
    advice: useHudSlice(hud, (state) => state.advice).list,
    voices: useHudSlice(hud, (state) => state.voices),
    status: useHudSlice(hud, (state) => state.status),
    signs: useHudSlice(hud, (state) => state.signs),
    selection: useHudSlice(hud, (state) => state.selection),
    orders: useHudSlice(hud, (state) => state.orders),
    ledger: useHudSlice(hud, (state) => state.ledger),
    land: useHudSlice(hud, (state) => state.land),
    pending: useHudSlice(hud, (state) => state.pending),
  };
}

type Panel = Exclude<PageId, 'inspect' | TabbedWindow>;
type Framed = Exclude<WindowId, 'inspect'>;

const FRAMED = WINDOW_IDS.filter((id): id is Framed => id !== 'inspect');

const modeOf = (ledger: Ledger | null): GameMode | null => ledger?.mode ?? null;

// Read at render, so a toast raised before the hire offers nothing once the role is enough.
const hireControls = (props: HudView): HireControls => ({
  offerFor: (advice) => hireOffer(advice, props.stats?.staff ?? null),
  onHire: (offer) => props.resort.setHiring(offer.role, offer.count),
});

// null for the newest, which is where the Overview and the palette open it.
const openReport = (props: Pick<HudView, 'history' | 'windows'>, day: number | null): void => {
  props.history.show(day);
  props.windows.show('report', true);
};

// Null when a window has nothing to show yet, such as the generator before the first resort.
const CONTENT: { readonly [panel in Panel]: (props: HudView) => ReactNode } = {
  build: (props) => (
    <BuildPalette
      preview={props.preview}
      tool={props.tool}
      onToolChange={props.onToolChange}
      onTurn={props.onTurn}
      ledger={props.ledger}
      land={props.land}
      // A focused field raises a phone's keyboard over half the screen, so a sheet waits for a tap.
      focusSearch={props.windows.layout.focus === 'build' && !isCompact(props.layout)}
      // A phone's sheet covers the map, so it is put away once there is something to place.
      onObjectPicked={() => {
        if (isCompact(props.layout)) props.windows.show('build', false);
      }}
    />
  ),
  summary: (props) => (
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
      hire={hireControls(props)}
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
  photos: ({ voices, history, photo }) => (
    <PhotoWallPanel today={voices.photos} history={history.history} photo={photo} />
  ),
  guests: (props) => <GuestsPanel voices={props.voices} />,
  staff: ({ stats, status, resort }) => (
    <StaffPanel staff={stats?.staff ?? null} tally={status?.staff} onHire={resort.setHiring} />
  ),
  programme: ({ programme }) => <ProgrammePanel programme={programme} />,
  money: (props) => <LedgerPanel ledger={props.ledger} />,
  prices: ({ stats, resort }) => (
    <PricesPanel prices={stats?.prices ?? null} onPrice={resort.setPrice} />
  ),
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
  share: ({ saves, resort, onShare }) => (
    <SharePanel onShare={onShare} title={resort.name} busy={slotsBusy(saves)} />
  ),
  debug: (props) => <RenderStats stats={props.stats} elements={props.nodes} />,
};

function frameOf(props: HudView, id: WindowId, onClose: () => void): HudWindowFrame {
  const { windows } = props;
  const compact = isCompact(props.layout);
  return {
    id,
    compact,
    peek: compact && id === 'build' && props.tool !== null,
    spot: windows.layout.spots[id] ?? null,
    depth: depthOf(windows.layout, id),
    takesFocus: windows.layout.focus === id,
    onRaise: () => windows.raise(id),
    onMove: (spot) => windows.move(id, spot),
    onClose,
  };
}

function tabbedBody(props: HudView, id: TabbedWindow): ReactNode {
  const page = props.windows.tab(id);
  const content = CONTENT[page](props);
  if (content === null) return null;
  const panelId = `hud-${id}-tabpanel`;
  return (
    <>
      <Tabs<TabId>
        tabs={WINDOW_TABS[id]}
        current={page}
        onPick={(tab) => props.windows.show(tab, true)}
        titleOf={(tab) => TAB_TITLES[tab]}
        iconOf={(tab) => TAB_ICONS[tab]}
        badgeOf={(tab) => (tab === 'advice' ? props.advice.length : 0)}
        label={WINDOW_TITLES[id]}
        panelId={panelId}
      />
      <div role="tabpanel" id={panelId} aria-labelledby={tabIdOf(panelId, page)}>
        {content}
      </div>
    </>
  );
}

const bodyOf = (props: HudView, id: Framed): ReactNode =>
  isTabbed(id) ? tabbedBody(props, id) : CONTENT[id](props);

const selectedKey = (selection: SelectionView | null): string | null => {
  if (selection === null) return null;
  if (selection.kind === 'place') return `place:${selection.key}`;
  return selection.kind === 'guest' ? `guest:${selection.person}` : `staff:${selection.worker}`;
};

function Windows(props: HudView) {
  const { windows } = props;
  const selected = selectedKey(props.selection);
  const { raise } = windows;
  // A tap on the map never reaches the inspector, so a fresh pick would open under a raised sheet.
  useEffect(() => {
    if (selected !== null) raise('inspect');
  }, [selected, raise]);
  return (
    <>
      {FRAMED.filter((id) => isOpen(windows.layout, id)).map((id) => {
        const content = bodyOf(props, id);
        if (content === null) return null;
        return (
          <HudWindow
            key={id}
            frame={frameOf(props, id, () => windows.show(id, false))}
            title={WINDOW_TITLES[id]}
            icon={WINDOW_ICONS[id]}
          >
            {content}
          </HudWindow>
        );
      })}
      {/* The follow card stands in for the inspector, and takes its activity line. */}
      {props.guestView.following ? null : (
        <InspectPanel
          frame={frameOf(props, 'inspect', props.inspector.clear)}
          selection={props.selection}
          advice={props.advice}
          activityElement={props.nodes.inspect}
          onSelectPerson={props.inspector.selectPerson}
          onShow={props.inspector.showSelected}
          onFollow={props.guestView.follow}
          onSend={props.inspector.send}
          hire={hireControls(props)}
          onRenameVenue={props.inspector.renameVenue}
          onOpenProgramme={(key) => {
            props.programme.choose(key);
            windows.show('programme', true);
          }}
        />
      )}
    </>
  );
}

// Built only while open, and afresh each time, so every tick and check mark reads the current state.
function Palette(props: HudView) {
  if (!props.palette) return null;
  return (
    <CommandPalette commands={listCommands(props)} onClose={() => props.onPaletteChange(false)} />
  );
}

// They are for running the resort, and at a guest's eye a sign would be as big as a door.
const markersShown = (props: HudView): boolean =>
  props.news.prefs.markers && props.guestView.following === null;

const signsShown = (props: HudView): boolean =>
  props.news.prefs.signs && props.guestView.following === null;

// The same list ProblemMarkers draws, so a sign gives way only to a marker that is showing.
const markedTiles = (props: HudView) =>
  markersShown(props) ? markersOf(props.advice).map((marker) => marker.at) : [];

type Collapse = (collapsed: boolean) => void;

// Starts collapsed, and collapses again on going into first person.
function useCollapsed(view: ViewMode | null) {
  const [collapsed, setCollapsed] = useState(true);
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView) {
    setSeenView(view);
    setCollapsed(collapsedOnView(collapsed, seenView, view));
  }
  return [collapsed, setCollapsed] as const;
}

// A window's sheet has the bottom of the screen, so the card is a bar on it until it shuts, or is
// shut to open the card.
function sheetOver(windows: HudView['windows'], collapsed: boolean, onCollapse: Collapse) {
  const sheets = FRAMED.filter((id) => isOpen(windows.layout, id));
  return {
    collapsed: collapsed || sheets.length > 0,
    onCollapse: (next: boolean) => {
      if (!next) for (const id of sheets) windows.show(id, false);
      onCollapse(next);
    },
  };
}

function useFollowSheet(props: HudView): FollowSheet | null {
  const [collapsed, setCollapsed] = useCollapsed(props.guestView.following?.view ?? null);
  return isCompact(props.layout) ? sheetOver(props.windows, collapsed, setCollapsed) : null;
}

// Always mounted, so a card dragged out of the way or collapsed stays so for the next follow.
function Following(props: HudView) {
  const { following } = props.guestView;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const sheet = useFollowSheet(props);
  if (!following) return null;
  return (
    <FollowCard
      offset={offset}
      onMove={setOffset}
      sheet={sheet}
      following={following}
      selection={props.selection}
      activityElement={props.nodes.inspect}
      onToggleView={props.guestView.toggleView}
      onRideAlong={props.guestView.rideAlong}
      onStop={props.guestView.stop}
    />
  );
}

export function Hud({ hud, nodes, controls, placement, inspector, chrome }: HudProps) {
  const props: HudView = {
    ...controls,
    ...placement,
    ...chrome,
    ...useHudSlices(hud),
    nodes,
    inspector,
  };
  return (
    <div className="hud">
      <TopBar
        barElement={props.bar}
        dayElement={props.nodes.day}
        timeElement={props.nodes.time}
        clock={props.clock}
        resort={props.resort}
        saves={props.saves}
        overlay={props.overlay}
        highlights={props.highlights}
        compact={isCompact(props.layout)}
        ledger={props.ledger}
        status={props.status}
        trend={starsTrend(props.history.history)}
        adviceCount={props.advice.length}
        windows={props.windows}
        menu={props.menu}
        onMenuChange={props.onMenuChange}
        onFind={() => props.onPaletteChange(true)}
        view={{
          markers: props.news.prefs.markers,
          onMarkersChange: props.news.setMarkers,
          staffPins: props.news.prefs.staff,
          onStaffPinsChange: props.news.setStaffPins,
          signs: props.news.prefs.signs,
          onSignsChange: props.news.setSigns,
        }}
        shortcuts={{
          singleKeys: props.news.prefs.singleKeys,
          onSingleKeysChange: props.news.setSingleKeys,
        }}
        sound={props.sound}
        forecast={props.programme.forecast}
        onPhoto={props.photo.enter}
      />
      <Windows {...props} />
      <PlacementBar
        pending={props.pending}
        tool={props.tool}
        land={props.land}
        onConfirm={props.onConfirm}
        onDismiss={props.onDismiss}
        onTurn={props.onTurn}
      />
      <Following {...props} />
      <ArmedChip
        tool={props.tool}
        land={props.land}
        pending={props.pending}
        paletteOpen={isOpen(props.windows.layout, 'build')}
        onOpen={() => props.windows.show('build', true)}
        onDisarm={() => props.onToolChange(null)}
      />
      <Toasts
        toasts={props.news.toasts}
        onUpdate={props.onUpdate}
        news={{
          history: props.history.history,
          mode: modeOf(props.ledger),
          onShowOnPlot: props.onShowOnPlot,
          hire: hireControls(props),
          onOpenAdvice: () => props.windows.show('advice', true),
          onOpenReport: (day) => openReport(props, day),
          onDismiss: props.news.dismiss,
        }}
        onHold={props.news.hold}
      />
      {/* Last in Tab order, behind the bar and the windows; their z-index keeps them painted under. */}
      <section aria-label="On the map">
        <VenueSigns
          spots={props.signs}
          shown={signsShown(props)}
          named={props.signsNamed}
          marked={markedTiles(props)}
          elements={props.nodes.signs}
          onSelectAt={props.inspector.selectAt}
        />
        <StaffPins elements={props.nodes.staffPins} onSelectWorker={props.inspector.selectWorker} />
        <ProblemMarkers
          advice={props.advice}
          shown={markersShown(props)}
          elements={props.nodes.markers}
          onShowOnPlot={props.onShowOnPlot}
          onSelectAt={props.inspector.selectAt}
          orders={props.orders}
          onSendCleaner={props.inspector.sendCleanerTo}
        />
      </section>
      <Palette {...props} />
      {props.error ? <HudError message={props.error} /> : null}
      {!props.error && props.refusal ? (
        <HudError title={props.refusal.title} message={props.refusal.message} />
      ) : null}
    </div>
  );
}
