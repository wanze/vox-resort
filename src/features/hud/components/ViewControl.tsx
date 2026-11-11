import { useId, useState } from 'react';
import { DropdownPopover } from '../../../shared/components/Dropdown';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { Tabs, tabIdOf } from '../../../shared/components/Tabs';
import { HighlightLegend, HighlightOptions } from '../../highlights/components/HighlightPicker';
import { OverlayLegend, OverlayOptions } from '../../overlays/components/OverlayPicker';
import { OVERLAY_NAMES, OVERLAY_QUESTIONS } from '../../overlays/components/overlayNames';
import type { HighlightControls } from '../../highlights/components/highlightControls';
import type { OverlayControls } from '../../overlays/components/overlayControls';

type ViewTab = 'maps' | 'highlight';

const VIEW_TABS: readonly ViewTab[] = ['maps', 'highlight'];

const TAB_TITLES: { readonly [tab in ViewTab]: string } = {
  maps: 'Map',
  highlight: 'Highlight',
};

const TAB_ICONS = { maps: 'overlay', highlight: 'inspect' } as const;

export interface ViewControlProps {
  readonly overlay: OverlayControls;
  readonly highlights: HighlightControls;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  // Off on a touch layout, where focusing the field would throw up the keyboard over the list.
  readonly focusSearch: boolean;
}

function labelOf(overlay: OverlayControls, picked: number): string {
  const map = overlay.kind ? OVERLAY_NAMES[overlay.kind] : 'View';
  return picked > 0 ? `${map} · ${picked}` : map;
}

function titleOf(overlay: OverlayControls, picked: number): string {
  const map = overlay.kind ? `Map: ${OVERLAY_QUESTIONS[overlay.kind]}` : 'Map view off';
  return picked > 0 ? `View. ${map}; ${picked} kinds highlighted` : `View. ${map}`;
}

// The map layer and the highlights both change how the resort is drawn, so one key holds both;
// each legend still hangs under it while its layer is on.
export function ViewControl({
  overlay,
  highlights,
  open,
  onOpenChange,
  focusSearch,
}: ViewControlProps) {
  const [tab, setTab] = useState<ViewTab>('maps');
  const panelId = useId();
  const picked = highlights.picks.length;
  const done = (): void => onOpenChange(false);
  return (
    <div className="hud-view">
      <DropdownPopover
        name="View"
        className="hud-view-menu"
        open={open}
        onOpenChange={onOpenChange}
        title={titleOf(overlay, picked)}
        label={
          <>
            <PixelIcon name="overlay" />
            <span className="ui-key-label">{labelOf(overlay, picked)}</span>
          </>
        }
      >
        <Tabs
          tabs={VIEW_TABS}
          current={tab}
          onPick={setTab}
          titleOf={(each) =>
            each === 'highlight' && picked > 0 ? `Highlight · ${picked}` : TAB_TITLES[each]
          }
          iconOf={(each) => TAB_ICONS[each]}
          label="View"
          panelId={panelId}
        />
        <div
          role="tabpanel"
          id={panelId}
          className="hud-view-page"
          aria-labelledby={tabIdOf(panelId, tab)}
        >
          {tab === 'maps' ? (
            <OverlayOptions kind={overlay.kind} onKindChange={overlay.setOverlay} onDone={done} />
          ) : (
            <HighlightOptions highlights={highlights} focusSearch={focusSearch} onDone={done} />
          )}
        </div>
      </DropdownPopover>
      <div className="hud-view-legends">
        <OverlayLegend kind={overlay.kind} onKindChange={overlay.setOverlay} />
        <HighlightLegend
          types={highlights.types}
          picks={highlights.picks}
          onClear={highlights.clear}
        />
      </div>
    </div>
  );
}
